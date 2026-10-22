import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, col, fn, literal } from 'sequelize';
import { Crossing } from '@app/entities/models/crossing.entity';
import { CrossingAlert } from '@app/entities/models/crossing-alert.entity';
import { User } from '@app/entities/models/user.entity';
import {
  CROSSING_FILTER_COLUMNS,
  CROSSING_SORT_COLUMNS,
  DB_CONNECTION,
  FACETS,
  PAGINATION,
  SEVERITY_BY_RANK,
  UNKNOWN_FILTER_VALUE,
  type CrossingFilterField,
} from '@app/entities/constants/constants';
import type { JwtPayload } from '@app/entities/interfaces/jwt-payload.interface';
import { buildCrossingWhere } from '@app/entities/query/crossing-where';
import {
  decodeCursor,
  encodeCursor,
  keysetWhere,
  type CursorPayload,
} from '@app/entities/query/cursor';
import {
  PlazaAccessService,
  type PlazaScope,
} from '../plazas/plaza-access.service';
import {
  DETAIL_ATTRIBUTES,
  LIST_ATTRIBUTES,
  toDetail,
  toListItem,
} from './crossing.serializer';
import { toAlertFields } from '../alerts/alert.serializer';
import { WatchlistService } from '../watchlist/watchlist.service';
import { ListCrossingsDto } from './dto/list-crossings.dto';
import { CrossingFacetsDto } from './dto/crossing-facets.dto';
import { CrossingUpdatesDto } from './dto/crossing-updates.dto';
import type { Response } from 'express';
import { csvLine, startCsv } from '@app/entities/utils/csv';
import { formatInTz } from '@app/entities/utils/time';

const UPDATES_SORT = 'updates';
const EXPORT_BATCH = 1000;

// Only the id matters for updates; t is required by the cursor format
const updatesCursor = (id: number) =>
  encodeCursor({
    s: UPDATES_SORT,
    d: 'asc',
    t: new Date(0).toISOString(),
    i: id,
  });

@Injectable()
export class CrossingsService {
  constructor(
    @InjectModel(Crossing, DB_CONNECTION)
    private readonly crossingModel: typeof Crossing,
    @InjectModel(CrossingAlert, DB_CONNECTION)
    private readonly alertModel: typeof CrossingAlert,
    private readonly plazaAccess: PlazaAccessService,
    private readonly watchlist: WatchlistService,
  ) {}

  /**
   * Keyset-paginated list. Fetches limit + 1 rows: the extra row only tells
   * us whether there is a next page.
   */
  async list(user: JwtPayload, dto: ListCrossingsDto) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);
    const where = buildCrossingWhere(dto, scope);

    const sort = dto.sort ?? 'timestamp';
    const dir = dto.dir ?? 'desc';
    const limit = dto.limit ?? PAGINATION.default_limit;
    const column = CROSSING_SORT_COLUMNS[sort];

    const pageWhere = dto.cursor
      ? {
          [Op.and]: [
            where,
            keysetWhere(column, dir, decodeCursor(dto.cursor, sort, dir)),
          ],
        }
      : where;

    const [rows, total] = await Promise.all([
      this.crossingModel.findAll({
        attributes: [...LIST_ATTRIBUTES],
        where: pageWhere,
        order: [
          ...(column ? [[column, dir] as [string, string]] : []),
          ['crossed_at', dir],
          ['id', dir],
        ],
        limit: limit + 1,
        raw: true,
      }),
      dto.include_total ? this.crossingModel.count({ where }) : undefined,
    ]);

    const page = rows.slice(0, limit);
    const watch = await this.watchlist.lookup(
      scope.plaza_id,
      page.map((row) => row.plate_normalized),
    );
    const last = page[page.length - 1];
    const next_cursor =
      rows.length > limit && last
        ? encodeCursor({
            s: sort,
            d: dir,
            ...(column && { v: last[column] }),
            t: new Date(last.crossed_at).toISOString(),
            i: Number(last.id),
          })
        : null;

    return {
      items: page.map((row) => toListItem(row, scope, watch)),
      next_cursor,
      ...(total !== undefined && { total }),
    };
  }

  /**
   * One crossing with its media and how often the plate has crossed this
   * plaza. The plaza comes from the row, then the access check runs on it.
   */
  async detail(user: JwtPayload, id: number, tz?: string) {
    const row = await this.crossingModel.findOne({
      attributes: [...DETAIL_ATTRIBUTES],
      where: { id },
      raw: true,
    });
    if (!row) {
      throw new NotFoundException('Crossing not found');
    }

    const scope = await this.plazaAccess.resolve(user, row.plaza_id, tz);
    const [plateCrossingCount, alerts, watch] = await Promise.all([
      row.plate_normalized
        ? this.crossingModel.count({
            where: {
              plaza_id: row.plaza_id,
              plate_normalized: row.plate_normalized,
            },
          })
        : 1,
      this.alertModel.findAll({
        where: { crossing_id: row.id },
        include: [
          {
            model: User,
            as: 'reviewer',
            attributes: ['id', 'name'],
            required: false,
          },
        ],
        order: [
          ['severity_rank', 'DESC'],
          ['id', 'ASC'],
        ],
      }),
      this.watchlist.lookup(row.plaza_id, [row.plate_normalized]),
    ]);

    const detail = toDetail(row, scope, plateCrossingCount, watch);
    return {
      ...detail,
      alerts: {
        ...detail.alerts,
        items: alerts.map((alert) => toAlertFields(alert, scope)),
      },
    };
  }

  /**
   * Distinct values of each requested column with counts. Each field is
   * counted with every filter applied except its own, so a dropdown still
   * shows the other values it could switch to.
   */
  async facets(user: JwtPayload, dto: CrossingFacetsDto) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);
    const limit = dto.limit ?? FACETS.default_limit;

    const facets = await Promise.all(
      [...new Set(dto.field)].map((field) =>
        this.facet(field, dto, scope, limit),
      ),
    );
    return { facets };
  }

  /**
   * Crossings stored after the cursor, oldest first, for the "N new" pill
   * and polling. Ordered by id (insertion order), so a crossing that
   * arrives late with an older timestamp still counts as new. Without
   * `since`, returns no items and a cursor to start from.
   */
  async updates(user: JwtPayload, dto: CrossingUpdatesDto) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);
    const limit = dto.limit ?? PAGINATION.max_limit;

    if (!dto.since) {
      const maxId = await this.crossingModel.max<number, Crossing>('id', {
        where: { plaza_id: scope.plaza_id },
      });
      return {
        items: [],
        count: 0,
        has_more: false,
        next_cursor: updatesCursor(Number(maxId ?? 0)),
      };
    }

    const sinceId = decodeCursor(dto.since, UPDATES_SORT, 'asc').i;
    const rows = await this.crossingModel.findAll({
      attributes: [...LIST_ATTRIBUTES],
      where: {
        [Op.and]: [
          buildCrossingWhere(dto, scope),
          { id: { [Op.gt]: sinceId } },
        ],
      },
      order: [['id', 'ASC']],
      limit: limit + 1,
      raw: true,
    });
    const page = rows.slice(0, limit);
    const watch = await this.watchlist.lookup(
      scope.plaza_id,
      page.map((row) => row.plate_normalized),
    );
    const last = page[page.length - 1];

    return {
      items: page.map((row) => toListItem(row, scope, watch)),
      count: page.length,
      has_more: rows.length > limit,
      next_cursor: updatesCursor(last ? Number(last.id) : sinceId),
    };
  }

  /**
   * Previous/next crossing and "12 / 340" for the detail drawer, within the
   * same filters and sort as the table. position is null when the crossing
   * doesn't match the filters.
   */
  async adjacent(user: JwtPayload, id: number, dto: ListCrossingsDto) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);
    const row = await this.crossingModel.findOne({
      attributes: [...LIST_ATTRIBUTES],
      where: { id, plaza_id: scope.plaza_id },
      raw: true,
    });
    if (!row) {
      throw new NotFoundException('Crossing not found');
    }

    const sort = dto.sort ?? 'timestamp';
    const dir = dto.dir ?? 'desc';
    const back = dir === 'desc' ? 'asc' : 'desc';
    const column = CROSSING_SORT_COLUMNS[sort];
    const where = buildCrossingWhere(dto, scope);
    const at = {
      s: sort,
      d: dir,
      ...(column && { v: row[column] }),
      t: new Date(row.crossed_at).toISOString(),
      i: Number(row.id),
    };
    const order = (direction: 'asc' | 'desc') =>
      [
        ...(column ? [[column, direction] as [string, string]] : []),
        ['crossed_at', direction],
        ['id', direction],
      ] as [string, string][];
    const beside = (direction: 'asc' | 'desc') =>
      this.crossingModel.findOne({
        attributes: ['id'],
        where: { [Op.and]: [where, keysetWhere(column, direction, at)] },
        order: order(direction),
        raw: true,
      });

    const [next, prev, before, total, matches] = await Promise.all([
      beside(dir),
      beside(back),
      this.crossingModel.count({
        where: { [Op.and]: [where, keysetWhere(column, back, at)] },
      }),
      this.crossingModel.count({ where }),
      this.crossingModel.count({ where: { [Op.and]: [where, { id }] } }),
    ]);

    return {
      prev_id: prev ? String(prev.id) : null,
      next_id: next ? String(next.id) : null,
      position: matches ? before + 1 : null,
      total,
    };
  }

  /**
   * The filtered, sorted list as CSV, streamed in keyset batches.
   */
  async exportCsv(user: JwtPayload, dto: ListCrossingsDto, res: Response) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);
    const money = scope.can_see_money;
    const sort = dto.sort ?? 'timestamp';
    const dir = dto.dir ?? 'desc';
    const column = CROSSING_SORT_COLUMNS[sort];
    const where = buildCrossingWhere(dto, scope);

    startCsv(res, `crossings-${scope.plaza_id}`, [
      'id',
      'timestamp',
      'lane',
      'camera',
      'plate',
      'plate_type',
      'state',
      'state_code',
      'district',
      'region',
      'make',
      'model',
      'color',
      'vehicle_class',
      'tag_class',
      'axles',
      'ev',
      'out_of_state',
      'commercial',
      'exempt',
      'exempt_class',
      ...(money ? ['amount'] : []),
      // Hard alerts, as in the list; description-only ones counted apart
      'alerts',
      'max_severity',
      ...(money ? ['alert_loss'] : []),
      'soft_alerts',
      'description',
    ]);

    let cursor: CursorPayload | null = null;
    for (;;) {
      const batch: Crossing[] = await this.crossingModel.findAll({
        attributes: [...LIST_ATTRIBUTES],
        where: cursor
          ? { [Op.and]: [where, keysetWhere(column, dir, cursor)] }
          : where,
        order: [
          ...(column ? [[column, dir] as [string, string]] : []),
          ['crossed_at', dir],
          ['id', dir],
        ],
        limit: EXPORT_BATCH,
        raw: true,
      });
      for (const row of batch) {
        const lane = row.lane_id
          ? scope.lanes_by_id.get(row.lane_id)
          : undefined;
        res.write(
          csvLine([
            row.id,
            formatInTz(row.crossed_at, scope.timezone),
            lane?.name,
            row.camera_name,
            row.license_plate,
            row.plate_bg_color,
            row.state_name,
            row.state_code,
            row.district,
            row.region,
            row.vehicle_make,
            row.vehicle_model,
            row.vehicle_color,
            row.vehicle_class,
            row.tag_class,
            row.axles,
            Boolean(row.is_ev),
            Boolean(row.is_oos),
            Boolean(row.is_commercial),
            Boolean(row.is_exempt),
            row.exempt_vehicle_class,
            ...(money ? [row.amount] : []),
            row.hard_alert_count,
            SEVERITY_BY_RANK[row.hard_alert_max_severity] ?? '',
            ...(money ? [row.hard_alert_loss] : []),
            row.alert_count - row.hard_alert_count,
            row.description,
          ]),
        );
      }
      if (batch.length < EXPORT_BATCH) break;
      const last = batch[batch.length - 1];
      cursor = {
        s: sort,
        d: dir,
        ...(column && { v: last[column] }),
        t: new Date(last.crossed_at).toISOString(),
        i: Number(last.id),
      };
    }
    res.end();
  }

  private async facet(
    field: CrossingFilterField,
    dto: CrossingFacetsDto,
    scope: PlazaScope,
    limit: number,
  ) {
    const column = CROSSING_FILTER_COLUMNS[field];
    const rows = (await this.crossingModel.findAll({
      attributes: [
        [col(column), 'value'],
        [fn('COUNT', literal('*')), 'count'],
        // Window over the grouped rows: the total before LIMIT
        [literal('SUM(COUNT(*)) OVER ()'), 'total'],
      ],
      where: buildCrossingWhere(dto, scope, { exclude: field }),
      group: [column],
      order: [
        [literal('`count`'), 'DESC'],
        [col(column), 'ASC'],
      ],
      limit,
      raw: true,
    })) as unknown as {
      value: string | number | null;
      count: number | string;
      total: number | string;
    }[];

    return {
      field,
      total: Number(rows[0]?.total ?? 0),
      values: rows.map((row) => ({
        ...facetValue(field, row.value, scope),
        count: Number(row.count),
      })),
    };
  }
}

/**
 * `value` is what the filter param takes back (lane number, not lane id);
 * `label` is for display.
 */
function facetValue(
  field: CrossingFilterField,
  value: string | number | null,
  scope: PlazaScope,
) {
  if (value === null) {
    return { value: UNKNOWN_FILTER_VALUE, label: UNKNOWN_FILTER_VALUE };
  }
  if (field === 'lane') {
    const lane = scope.lanes_by_id.get(Number(value));
    return lane
      ? { value: String(lane.number), label: lane.name }
      : { value: UNKNOWN_FILTER_VALUE, label: UNKNOWN_FILTER_VALUE };
  }
  return { value: String(value), label: String(value) };
}
