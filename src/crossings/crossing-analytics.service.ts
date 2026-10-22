import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, col, fn, literal, type WhereOptions } from 'sequelize';
import { Crossing } from '@app/entities/models/crossing.entity';
import {
  BOOLEAN_STAT_FIELDS,
  DB_CONNECTION,
  STATS,
  STAT_FIELD_COLUMNS,
  TIMELINE_BUCKETS,
  TIMELINE_MAX_BUCKETS,
  UNKNOWN_FILTER_VALUE,
  type HourlyGroup,
  type StatField,
} from '@app/entities/constants/constants';
import type { JwtPayload } from '@app/entities/interfaces/jwt-payload.interface';
import { CrossingFilterDto } from '@app/entities/query/crossing-filter.dto';
import {
  buildCrossingWhere,
  resolveTimeWindow,
} from '@app/entities/query/crossing-where';
import { formatInTz, tzOffsetMinutes } from '@app/entities/utils/time';
import { localHour } from '@app/entities/query/sql-expressions';
import {
  PlazaAccessService,
  type PlazaScope,
} from '../plazas/plaza-access.service';
import { pct } from './crossing-stats.service';
import { ReferenceService } from '../reference/reference.service';
import type { ReferenceData } from '@app/entities/interfaces/reference-data.interface';
import {
  BreakdownDto,
  HourlyDto,
  MatrixDto,
  TimelineDto,
} from './dto/analytics.dto';

const HOURLY_GROUP_COLUMNS: Record<Exclude<HourlyGroup, 'none'>, string> = {
  region: 'region',
  plate_type: 'plate_bg_color',
  commercial: 'is_commercial',
  lane: 'lane_id',
  tag_class: 'tag_class',
};

const BOOLEAN_LABELS: Partial<Record<StatField, [string, string]>> = {
  oos: ['Out of state', 'In state'],
  ev: ['EV', 'Non-EV'],
  commercial: ['Commercial', 'Private'],
};

type KeyCount = { key: string | number | null; count: number | string };

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Analytics tab (#8-#12). Every query takes the shared crossing filters and
 * buckets hours and days in plaza time (or `tz`).
 */
@Injectable()
export class CrossingAnalyticsService {
  constructor(
    @InjectModel(Crossing, DB_CONNECTION)
    private readonly crossingModel: typeof Crossing,
    private readonly plazaAccess: PlazaAccessService,
    private readonly reference: ReferenceService,
  ) {}

  async overview(user: JwtPayload, dto: CrossingFilterDto) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);
    const where = buildCrossingWhere(dto, scope);

    const [totals, hourRows, topState] = await Promise.all([
      this.crossingModel.findOne({
        attributes: [
          [fn('COUNT', literal('*')), 'total'],
          [fn('COUNT', fn('DISTINCT', col('state_name'))), 'states'],
          [fn('COUNT', fn('DISTINCT', col('district'))), 'districts'],
          [fn('COUNT', fn('DISTINCT', col('vehicle_make'))), 'makes'],
        ],
        where,
        raw: true,
      }) as unknown as Promise<Record<string, number | string>>,
      this.groupCount(where, localHour(scope.timezone)),
      this.groupCount(
        { [Op.and]: [where, { state_name: { [Op.ne]: null } }] },
        col('state_name'),
        1,
      ),
    ]);

    const total = Number(totals.total);
    const hours = toHours(hourRows);
    const peakCount = Math.max(...hours);
    const activeHours = hours.filter((count) => count > 0).length;
    const top = topState[0];

    return {
      total,
      unique_states: Number(totals.states),
      unique_districts: Number(totals.districts),
      unique_makes: Number(totals.makes),
      // Hour of day (0-23) in plaza time, as in the dashboard
      peak_hour: peakCount > 0 ? hours.indexOf(peakCount) : null,
      peak_count: peakCount,
      top_state: top
        ? {
            value: String(top.key),
            count: Number(top.count),
            pct: pct(Number(top.count), total),
          }
        : null,
      active_hours: activeHours,
      avg_per_hour: activeHours ? round2(total / activeHours) : 0,
    };
  }

  /**
   * Counts per time bucket with empty buckets filled in, plus mean, standard
   * deviation and the buckets above mean + 2σ.
   */
  async timeline(user: JwtPayload, dto: TimelineDto) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);
    const bucket = dto.bucket ?? '15m';
    const size = TIMELINE_BUCKETS[bucket];
    const offset = tzOffsetMinutes(scope.timezone) * 60;
    const bucketOf = (ms: number) => Math.floor((ms / 1000 + offset) / size);

    const rows = await this.groupCount(
      buildCrossingWhere(dto, scope),
      literal(
        `FLOOR((TIMESTAMPDIFF(SECOND, '1970-01-01 00:00:00', crossed_at) + ${offset}) / ${size})`,
      ),
      undefined,
      'key',
    );
    const counts = new Map(
      rows.map((row) => [Number(row.key), Number(row.count)]),
    );

    // Range: the requested window, widened to any data outside it (e.g. "all")
    const window = resolveTimeWindow(dto, scope.timezone);
    const keys = [...counts.keys()];
    const first = window.start
      ? bucketOf(window.start.getTime())
      : keys.length
        ? Math.min(...keys)
        : null;
    const last = window.end
      ? bucketOf(window.end.getTime() - 1)
      : bucketOf(Date.now());

    if (first === null || last < first) {
      return { bucket, buckets: [], mean: 0, std_dev: 0, anomalies: [] };
    }
    if (last - first + 1 > TIMELINE_MAX_BUCKETS) {
      throw new BadRequestException(
        `That range has more than ${TIMELINE_MAX_BUCKETS} ${bucket} buckets; use a larger bucket`,
      );
    }

    const buckets: { start: string | null; count: number }[] = [];
    for (let key = first; key <= last; key++) {
      buckets.push({
        start: formatInTz(
          new Date((key * size - offset) * 1000),
          scope.timezone,
        ),
        count: counts.get(key) ?? 0,
      });
    }

    const values = buckets.map((b) => b.count);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length,
    );
    const threshold = mean + 2 * stdDev;

    return {
      bucket,
      buckets,
      mean: round2(mean),
      std_dev: round2(stdDev),
      anomalies:
        stdDev > 0
          ? values.flatMap((v, index) => (v > threshold ? [index] : []))
          : [],
    };
  }

  /**
   * 24 hour-of-day counts per group (region, plate type, ...), for the
   * stacked hour chart and the heatmaps.
   */
  async hourly(user: JwtPayload, dto: HourlyDto) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);
    const reference = await this.reference.data();
    const groupBy = dto.group_by ?? 'none';
    const where = buildCrossingWhere(dto, scope);
    const hour = localHour(scope.timezone);

    if (groupBy === 'none') {
      const hours = toHours(await this.groupCount(where, hour));
      return {
        group_by: groupBy,
        groups: [{ key: 'all', label: 'All', hours }],
      };
    }

    const column = HOURLY_GROUP_COLUMNS[groupBy];
    const rows = (await this.crossingModel.findAll({
      attributes: [
        [col(column), 'key'],
        [hour, 'hour'],
        [fn('COUNT', literal('*')), 'count'],
      ],
      where,
      group: [column, 'hour'],
      raw: true,
    })) as unknown as (KeyCount & { hour: number })[];

    const groups = new Map<
      string,
      { key: string; label: string; hours: number[] }
    >();
    for (const row of rows) {
      const { key, label } = labelFor(groupBy, row.key, scope, reference);
      const group = groups.get(key) ?? {
        key,
        label,
        hours: Array<number>(24).fill(0),
      };
      group.hours[Number(row.hour)] += Number(row.count);
      groups.set(key, group);
    }

    return {
      group_by: groupBy,
      groups: [...groups.values()].sort((a, b) => sum(b.hours) - sum(a.hours)),
    };
  }

  /**
   * Top-N counts for one field: every top list, share chart and bar chart.
   * Unknown (NULL) values are left out; pct is of all matching crossings.
   */
  async breakdown(user: JwtPayload, dto: BreakdownDto) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);
    const reference = await this.reference.data();
    const column = STAT_FIELD_COLUMNS[dto.field];
    const limit = dto.limit ?? STATS.breakdown_default_limit;
    const where = fieldWhere(dto.field, buildCrossingWhere(dto, scope));

    const [total, rows] = await Promise.all([
      this.crossingModel.count({ where }),
      this.crossingModel.findAll({
        attributes: [
          [col(column), 'key'],
          [fn('COUNT', literal('*')), 'count'],
          // Number of groups before LIMIT
          [literal('COUNT(*) OVER ()'), 'distinct'],
        ],
        where: { [Op.and]: [where, { [column]: { [Op.ne]: null } }] },
        group: [column],
        order: [
          [literal('`count`'), 'DESC'],
          [col(column), 'ASC'],
        ],
        limit,
        raw: true,
      }) as unknown as Promise<(KeyCount & { distinct: number | string })[]>,
    ]);

    return {
      field: dto.field,
      total,
      distinct: Number(rows[0]?.distinct ?? 0),
      items: rows.map((row) => ({
        ...labelFor(dto.field, row.key, scope, reference),
        count: Number(row.count),
        pct: pct(Number(row.count), total),
      })),
    };
  }

  /**
   * Counts for the top `row_limit` x top `col_limit` values, e.g. make x model.
   */
  async matrix(user: JwtPayload, dto: MatrixDto) {
    if (dto.rows === dto.cols) {
      throw new BadRequestException('rows and cols must be different fields');
    }
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);
    const reference = await this.reference.data();
    const rowColumn = STAT_FIELD_COLUMNS[dto.rows];
    const colColumn = STAT_FIELD_COLUMNS[dto.cols];
    const where = fieldWhere(
      dto.rows,
      fieldWhere(dto.cols, buildCrossingWhere(dto, scope)),
    );
    const known = (column: string): WhereOptions => ({
      [Op.and]: [where, { [column]: { [Op.ne]: null } }],
    });

    const [topRows, topCols] = await Promise.all([
      this.groupCount(
        known(rowColumn),
        col(rowColumn),
        dto.row_limit ?? STATS.matrix_default_rows,
      ),
      this.groupCount(
        known(colColumn),
        col(colColumn),
        dto.col_limit ?? STATS.matrix_default_cols,
      ),
    ]);
    const rowKeys = topRows.map((row) => row.key!);
    const colKeys = topCols.map((row) => row.key!);

    const cells = rowKeys.map(() => Array<number>(colKeys.length).fill(0));
    if (rowKeys.length && colKeys.length) {
      const pairs = (await this.crossingModel.findAll({
        attributes: [
          [col(rowColumn), 'row_key'],
          [col(colColumn), 'col_key'],
          [fn('COUNT', literal('*')), 'count'],
        ],
        where: {
          [Op.and]: [
            where,
            { [rowColumn]: { [Op.in]: rowKeys } },
            { [colColumn]: { [Op.in]: colKeys } },
          ],
        },
        group: [rowColumn, colColumn],
        raw: true,
      })) as unknown as {
        row_key: string | number;
        col_key: string | number;
        count: number | string;
      }[];

      const rowIndex = new Map(rowKeys.map((key, i) => [String(key), i]));
      const colIndex = new Map(colKeys.map((key, i) => [String(key), i]));
      for (const pair of pairs) {
        const r = rowIndex.get(String(pair.row_key));
        const c = colIndex.get(String(pair.col_key));
        if (r !== undefined && c !== undefined) {
          cells[r][c] = Number(pair.count);
        }
      }
    }

    return {
      rows: topRows.map((row) => ({
        ...labelFor(dto.rows, row.key, scope, reference),
        count: Number(row.count),
      })),
      cols: topCols.map((row) => ({
        ...labelFor(dto.cols, row.key, scope, reference),
        count: Number(row.count),
      })),
      cells,
    };
  }

  private groupCount(
    where: WhereOptions,
    key: ReturnType<typeof col> | ReturnType<typeof literal>,
    limit?: number,
    orderBy: 'count' | 'key' = 'count',
  ) {
    return this.crossingModel.findAll({
      attributes: [
        [key, 'key'],
        [fn('COUNT', literal('*')), 'count'],
      ],
      where,
      group: ['key'],
      order: [
        orderBy === 'count'
          ? [literal('`count`'), 'DESC']
          : [literal('`key`'), 'ASC'],
      ],
      ...(limit && { limit }),
      raw: true,
    }) as unknown as Promise<KeyCount[]>;
  }
}

function toHours(rows: KeyCount[]) {
  const hours = Array<number>(24).fill(0);
  for (const row of rows) {
    hours[Number(row.key)] = Number(row.count);
  }
  return hours;
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

// exempt_class only makes sense over exempt crossings
function fieldWhere(field: StatField, where: WhereOptions): WhereOptions {
  return field === 'exempt_class'
    ? { [Op.and]: [where, { is_exempt: true }] }
    : where;
}

/**
 * `key` is the value to filter by (lane number, not lane id; "true"/"false"
 * for flags); `label` is for display.
 */
function labelFor(
  field: StatField,
  value: string | number | null,
  scope: PlazaScope,
  reference: ReferenceData,
): { key: string; label: string } {
  if (value === null) {
    return { key: UNKNOWN_FILTER_VALUE, label: UNKNOWN_FILTER_VALUE };
  }
  if (BOOLEAN_STAT_FIELDS.includes(field)) {
    const flag = Number(value) === 1;
    const [yes, no] = BOOLEAN_LABELS[field]!;
    return { key: String(flag), label: flag ? yes : no };
  }
  if (field === 'lane') {
    const lane = scope.lanes_by_id.get(Number(value));
    return lane
      ? { key: String(lane.number), label: lane.name }
      : { key: UNKNOWN_FILTER_VALUE, label: UNKNOWN_FILTER_VALUE };
  }
  if (field === 'vehicle_class') {
    return {
      key: String(value),
      label: reference.classes.get(Number(value))?.name ?? String(value),
    };
  }
  if (field === 'tag_class') {
    const info = reference.tags.get(Number(value));
    return {
      key: String(value),
      label: info ? `Tag ${value} · ${info.description}` : `Tag ${value}`,
    };
  }
  return { key: String(value), label: String(value) };
}
