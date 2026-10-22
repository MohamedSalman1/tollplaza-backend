import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, col, fn, literal, type WhereOptions } from 'sequelize';
import type { Response } from 'express';
import { Crossing } from '@app/entities/models/crossing.entity';
import { CrossingAlert } from '@app/entities/models/crossing-alert.entity';
import { DB_CONNECTION } from '@app/entities/constants/constants';
import type { JwtPayload } from '@app/entities/interfaces/jwt-payload.interface';
import { CrossingFilterDto } from '@app/entities/query/crossing-filter.dto';
import { buildCrossingWhere } from '@app/entities/query/crossing-where';
import {
  localDay,
  localHour,
  resolvedTag,
} from '@app/entities/query/sql-expressions';
import { keysetWhere, type CursorPayload } from '@app/entities/query/cursor';
import { csvLine, startCsv } from '@app/entities/utils/csv';
import { formatInTz } from '@app/entities/utils/time';
import {
  PlazaAccessService,
  type PlazaScope,
} from '../plazas/plaza-access.service';
import { AlertsService } from '../alerts/alerts.service';
import { ReferenceService } from '../reference/reference.service';
import { AlertFilterDto } from '../alerts/dto/alert-filter.dto';
import { pct } from '../crossings/crossing-stats.service';
import { OverloadReportDto } from './dto/overload-report.dto';

type Num = number | string | null;

type DayHourRow = {
  day: string;
  hour: Num;
  count: Num;
  collection: Num;
  ev: Num;
  oos: Num;
  commercial: Num;
  exempt: Num;
};

type DayTotals = {
  count: number;
  collection: number;
  ev: number;
  oos: number;
  commercial: number;
  exempt: number;
};

const TOP_DAYS = 5;
const TOP_MAKES_PER_TAG = 3;
const UNVERIFIED_EXEMPT = 'Unverified / no class';
const EXPORT_BATCH = 1000;

const n = (value: Num | undefined) => Number(value ?? 0);
const round2 = (value: number) => Math.round(value * 100) / 100;
const emptyTotals = (): DayTotals => ({
  count: 0,
  collection: 0,
  ev: 0,
  oos: 0,
  commercial: 0,
  exempt: 0,
});

/**
 * Reports tab (#17-#21). Every report takes the shared crossing filters and
 * reads stored amounts and alerts, so its totals match the KPI strip and
 * alerts tab. Money fields are left out for roles that can't see money.
 */
@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Crossing, DB_CONNECTION)
    private readonly crossingModel: typeof Crossing,
    @InjectModel(CrossingAlert, DB_CONNECTION)
    private readonly alertModel: typeof CrossingAlert,
    private readonly plazaAccess: PlazaAccessService,
    private readonly alertsService: AlertsService,
    private readonly reference: ReferenceService,
  ) {}

  async summary(user: JwtPayload, dto: CrossingFilterDto) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);
    const where = buildCrossingWhere(dto, scope);
    const day = localDay(scope.timezone);

    const [totals, daily, tags, risk, overload] = await Promise.all([
      this.crossingModel.findOne({
        attributes: [
          [fn('COUNT', literal('*')), 'count'],
          [fn('COALESCE', fn('SUM', col('amount')), 0), 'collection'],
          [fn('SUM', col('is_exempt')), 'exempt'],
          [fn('SUM', col('is_ev')), 'ev'],
          [fn('SUM', col('is_oos')), 'oos'],
          [fn('SUM', col('is_commercial')), 'commercial'],
          [fn('COUNT', fn('DISTINCT', day)), 'days'],
          [fn('COUNT', fn('DISTINCT', resolvedTag())), 'active_tags'],
        ],
        where,
        raw: true,
      }) as unknown as Promise<Record<string, Num>>,
      this.crossingModel.findAll({
        attributes: [
          [day, 'day'],
          [fn('COUNT', literal('*')), 'count'],
          [fn('SUM', col('amount')), 'collection'],
        ],
        where,
        group: ['day'],
        order: [[literal('`day`'), 'ASC']],
        raw: true,
      }) as unknown as Promise<{ day: string; count: Num; collection: Num }[]>,
      this.tagCounts(where),
      this.alertTotals(dto, scope),
      this.alertTotals(this.overloadFilter(dto), scope),
    ]);

    const count = n(totals.count);
    const collection = n(totals.collection);
    const money = scope.can_see_money;
    const dailyItems = daily.map((row) => ({
      day: row.day,
      count: n(row.count),
      collection: n(row.collection),
    }));
    const mix = (value: Num) => ({
      count: n(value),
      pct: pct(n(value), count),
    });

    return {
      crossings: count,
      days: n(totals.days),
      ...(money && {
        collection,
        avg_per_crossing: count ? round2(collection / count) : 0,
        revenue_at_risk: {
          amount: risk.loss,
          pct_of_collection: pct(risk.loss, collection),
        },
      }),
      exempt: n(totals.exempt),
      daily: dailyItems.map((item) =>
        money ? item : { day: item.day, count: item.count },
      ),
      tag_share: tags.map((tag) => ({
        tag_class: tag.tag_class,
        count: tag.count,
        ...(money && { collection: tag.collection }),
        share: pct(tag.count, count),
      })),
      // By collection; by count for roles that can't see money
      top_days: [...dailyItems]
        .sort((a, b) =>
          money ? b.collection - a.collection : b.count - a.count,
        )
        .slice(0, TOP_DAYS)
        .map((item) => (money ? item : { day: item.day, count: item.count })),
      ops_mix: {
        commercial: mix(totals.commercial),
        ev: mix(totals.ev),
        oos: mix(totals.oos),
        exempt: mix(totals.exempt),
      },
      badges: {
        days: n(totals.days),
        active_tags: n(totals.active_tags),
        exempt: n(totals.exempt),
        overload: overload.count,
      },
    };
  }

  /**
   * Per local day: counts, collection, flags and a 24-hour profile, plus a
   * totals row.
   */
  async daily(user: JwtPayload, dto: CrossingFilterDto) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);
    const days = await this.dailyRows(buildCrossingWhere(dto, scope), scope);
    const money = scope.can_see_money;

    const totals = emptyTotals();
    const totalHours = Array<number>(24).fill(0);
    for (const item of days) {
      for (const key of Object.keys(totals) as (keyof DayTotals)[]) {
        totals[key] += item[key];
      }
      item.hours.forEach((count, hour) => (totalHours[hour] += count));
    }

    // undefined keys are dropped from the JSON response
    const strip = <T extends { collection: number }>(item: T) =>
      money ? item : { ...item, collection: undefined };

    return {
      days: days.map(strip),
      totals: strip({ ...totals, hours: totalHours }),
    };
  }

  /**
   * Per tag (every tag in tag_classes, even when empty): count, collection,
   * share, active days, top makes; and per tag x vehicle class.
   */
  async tagClasses(user: JwtPayload, dto: CrossingFilterDto) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);
    const where = buildCrossingWhere(dto, scope);
    const money = scope.can_see_money;

    const [byClass, activeDays, makes, total, reference] = await Promise.all([
      this.crossingModel.findAll({
        attributes: [
          [resolvedTag(), 'tag'],
          'vehicle_class',
          [fn('COUNT', literal('*')), 'count'],
          [fn('SUM', col('amount')), 'collection'],
        ],
        where,
        group: ['tag', 'vehicle_class'],
        raw: true,
      }) as unknown as Promise<
        { tag: Num; vehicle_class: Num; count: Num; collection: Num }[]
      >,
      this.crossingModel.findAll({
        attributes: [
          [resolvedTag(), 'tag'],
          [fn('COUNT', fn('DISTINCT', localDay(scope.timezone))), 'days'],
        ],
        where,
        group: ['tag'],
        raw: true,
      }) as unknown as Promise<{ tag: Num; days: Num }[]>,
      this.crossingModel.findAll({
        attributes: [
          [resolvedTag(), 'tag'],
          'vehicle_make',
          [fn('COUNT', literal('*')), 'count'],
        ],
        where: { [Op.and]: [where, { vehicle_make: { [Op.ne]: null } }] },
        group: ['tag', 'vehicle_make'],
        order: [[literal('`count`'), 'DESC']],
        raw: true,
      }) as unknown as Promise<
        { tag: Num; vehicle_make: string; count: Num }[]
      >,
      this.crossingModel.count({ where }),
      this.reference.data(),
    ]);

    const tags = new Map(
      [...reference.tags.values()].map((info) => [
        String(info.tag_class),
        {
          tag_class: String(info.tag_class),
          description: info.description,
          count: 0,
          collection: 0,
          active_days: 0,
          top_makes: [] as { make: string; count: number }[],
        },
      ]),
    );
    for (const row of byClass) {
      const tag = tags.get(String(row.tag));
      if (tag) {
        tag.count += n(row.count);
        tag.collection += n(row.collection);
      }
    }
    for (const row of activeDays) {
      const tag = tags.get(String(row.tag));
      if (tag) tag.active_days = n(row.days);
    }
    for (const row of makes) {
      const tag = tags.get(String(row.tag));
      if (tag && tag.top_makes.length < TOP_MAKES_PER_TAG) {
        tag.top_makes.push({ make: row.vehicle_make, count: n(row.count) });
      }
    }

    return {
      total,
      tags: [...tags.values()].map(({ collection, ...tag }) => ({
        ...tag,
        ...(money && { collection }),
        share: pct(tag.count, total),
      })),
      by_vehicle_class: byClass
        .filter((row) => row.tag !== null && row.vehicle_class !== null)
        .map((row) => ({
          tag_class: String(row.tag),
          vehicle_class: String(row.vehicle_class),
          name: reference.classes.get(n(row.vehicle_class))?.name ?? null,
          count: n(row.count),
          ...(money && { collection: n(row.collection) }),
        }))
        .sort(
          (a, b) =>
            Number(a.tag_class) - Number(b.tag_class) || b.count - a.count,
        ),
    };
  }

  /**
   * Exempt crossings by class with the toll they would otherwise have paid
   * (unit_price stored at ingest). A missing or "Not exempt" class is
   * counted as suspicious. The entries are GET /crossings?exempt=true.
   */
  async exempt(user: JwtPayload, dto: CrossingFilterDto) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);
    const where = buildCrossingWhere(dto, scope);
    const money = scope.can_see_money;

    const [groups, total] = await Promise.all([
      this.crossingModel.findAll({
        attributes: [
          'exempt_vehicle_class',
          [fn('COUNT', literal('*')), 'count'],
          [fn('SUM', col('unit_price')), 'forgone'],
        ],
        where: { [Op.and]: [where, { is_exempt: true }] },
        group: ['exempt_vehicle_class'],
        raw: true,
      }) as unknown as Promise<
        { exempt_vehicle_class: string | null; count: Num; forgone: Num }[]
      >,
      this.crossingModel.count({ where }),
    ]);

    const categories = new Map<string, { count: number; forgone: number }>();
    let suspicious = 0;
    for (const group of groups) {
      const name = group.exempt_vehicle_class;
      const unverified = !name || name.toLowerCase() === 'not exempt';
      const key = unverified ? UNVERIFIED_EXEMPT : name;
      const category = categories.get(key) ?? { count: 0, forgone: 0 };
      category.count += n(group.count);
      category.forgone += n(group.forgone);
      categories.set(key, category);
      if (unverified) suspicious += n(group.count);
    }

    const exemptTotal = [...categories.values()].reduce(
      (sum, c) => sum + c.count,
      0,
    );
    const forgone = [...categories.values()].reduce(
      (sum, c) => sum + c.forgone,
      0,
    );

    return {
      total: exemptTotal,
      pct_of_crossings: pct(exemptTotal, total),
      categories: [...categories.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .map(([name, category]) => ({
          class: name,
          count: category.count,
          ...(money && { forgone: category.forgone }),
        })),
      ...(money && { forgone_revenue: forgone }),
      suspicious,
    };
  }

  /**
   * Axle count implies a higher tag than charged: the stored AXLE_MISMATCH
   * alerts on non-exempt crossings, so the report agrees with the alerts tab.
   * Totals cover the whole range; `log` is one page (follow next_cursor).
   */
  async overload(user: JwtPayload, dto: OverloadReportDto) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);
    const filter = this.overloadFilter(dto);
    const { where, include } = this.alertsService.query(filter, scope, {
      withStatus: true,
      crossingAttributes: [],
    });

    const [groups, log] = await Promise.all([
      this.alertModel.findAll({
        attributes: [
          [col('crossing.axles'), 'axles'],
          [col('CrossingAlert.lane_id'), 'lane_id'],
          'severity',
          [fn('COUNT', literal('*')), 'count'],
          [fn('SUM', col('CrossingAlert.loss')), 'loss'],
        ],
        where,
        include,
        group: [
          col('crossing.axles'),
          col('CrossingAlert.lane_id'),
          'severity',
        ],
        raw: true,
      }) as unknown as Promise<
        {
          axles: Num;
          lane_id: number | null;
          severity: string;
          count: Num;
          loss: Num;
        }[]
      >,
      this.alertsService.list(user, {
        ...filter,
        limit: dto.limit,
        cursor: dto.cursor,
      }),
    ]);

    type Totals = { count: number; loss: number };
    let total = 0;
    let loss = 0;
    let high = 0;
    const byAxle = new Map<number, Totals>();
    const byLane = new Map<number | null, Totals>();
    for (const group of groups) {
      const count = n(group.count);
      const groupLoss = n(group.loss);
      total += count;
      loss += groupLoss;
      if (group.severity === 'HIGH') high += count;
      const add = <K>(map: Map<K, Totals>, key: K) => {
        const entry = map.get(key) ?? { count: 0, loss: 0 };
        entry.count += count;
        entry.loss += groupLoss;
        map.set(key, entry);
      };
      add(byAxle, n(group.axles));
      add(byLane, group.lane_id);
    }

    const money = scope.can_see_money;
    const withLoss = (entry: Totals) => ({
      count: entry.count,
      ...(money && { loss: entry.loss }),
    });
    const lanes = [...byLane.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([laneId, entry]) => ({
        lane: laneId === null ? null : (scope.lanes_by_id.get(laneId) ?? null),
        ...withLoss(entry),
      }));

    return {
      total,
      ...(money && { estimated_loss: loss }),
      high,
      worst_lane: lanes[0] ?? null,
      by_axle: [...byAxle.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([axles, entry]) => ({ axles, ...withLoss(entry) })),
      by_lane: lanes,
      log: log.items,
      next_cursor: log.next_cursor,
    };
  }

  // ----- CSV exports -----

  async exportSummary(user: JwtPayload, dto: CrossingFilterDto, res: Response) {
    const summary = await this.summary(user, dto);
    startCsv(res, `report-summary-${dto.plaza_id}`, ['metric', 'value']);
    const rows: [string, number | undefined][] = [
      ['crossings', summary.crossings],
      ['days', summary.days],
      ['collection', summary.collection],
      ['avg_per_crossing', summary.avg_per_crossing],
      ['revenue_at_risk', summary.revenue_at_risk?.amount],
      ['revenue_at_risk_pct', summary.revenue_at_risk?.pct_of_collection],
      ['exempt', summary.exempt],
      ['commercial', summary.ops_mix.commercial.count],
      ['ev', summary.ops_mix.ev.count],
      ['out_of_state', summary.ops_mix.oos.count],
      ['overload', summary.badges.overload],
    ];
    for (const [metric, value] of rows) {
      if (value !== undefined) res.write(csvLine([metric, value]));
    }
    res.end();
  }

  async exportDaily(user: JwtPayload, dto: CrossingFilterDto, res: Response) {
    const { days, totals } = await this.daily(user, dto);
    const money = 'collection' in totals;
    const hours = Array.from(
      { length: 24 },
      (_, h) => `h${String(h).padStart(2, '0')}`,
    );
    startCsv(res, `report-daily-${dto.plaza_id}`, [
      'day',
      'count',
      ...(money ? ['collection'] : []),
      'ev',
      'oos',
      'commercial',
      'exempt',
      ...hours,
    ]);
    for (const row of [...days, { day: 'TOTAL', ...totals }]) {
      res.write(
        csvLine([
          row.day,
          row.count,
          ...(money ? [(row as { collection?: number }).collection] : []),
          row.ev,
          row.oos,
          row.commercial,
          row.exempt,
          ...row.hours,
        ]),
      );
    }
    res.end();
  }

  async exportTagClasses(
    user: JwtPayload,
    dto: CrossingFilterDto,
    res: Response,
  ) {
    const report = await this.tagClasses(user, dto);
    // tags always has all seven entries, with collection only for money roles
    const money = 'collection' in report.tags[0];
    startCsv(res, `report-tag-classes-${dto.plaza_id}`, [
      'tag_class',
      'vehicle_class',
      'vehicle_class_name',
      'count',
      ...(money ? ['collection'] : []),
    ]);
    for (const row of report.by_vehicle_class) {
      res.write(
        csvLine([
          row.tag_class,
          row.vehicle_class,
          row.name,
          row.count,
          ...(money ? [(row as { collection?: number }).collection] : []),
        ]),
      );
    }
    res.end();
  }

  /**
   * The exempt entries themselves, streamed in keyset batches.
   */
  async exportExempt(user: JwtPayload, dto: CrossingFilterDto, res: Response) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);
    const money = scope.can_see_money;
    const where = buildCrossingWhere({ ...dto, exempt: true }, scope);
    startCsv(res, `report-exempt-${dto.plaza_id}`, [
      'id',
      'timestamp',
      'lane',
      'plate',
      'exempt_class',
      'vehicle_class',
      'tag_class',
      ...(money ? ['forgone_toll'] : []),
      'description',
      'state',
      'district',
    ]);

    let cursor: CursorPayload | null = null;
    for (;;) {
      const batch: Crossing[] = await this.crossingModel.findAll({
        attributes: [
          'id',
          'crossed_at',
          'lane_id',
          'camera_name',
          'license_plate',
          'exempt_vehicle_class',
          'vehicle_class',
          'tag_class',
          'unit_price',
          'description',
          'state_name',
          'district',
        ],
        where: cursor
          ? { [Op.and]: [where, keysetWhere(null, 'desc', cursor)] }
          : where,
        order: [
          ['crossed_at', 'DESC'],
          ['id', 'DESC'],
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
            lane?.name ?? row.camera_name,
            row.license_plate,
            row.exempt_vehicle_class,
            row.vehicle_class,
            row.tag_class,
            ...(money ? [row.unit_price] : []),
            row.description,
            row.state_name,
            row.district,
          ]),
        );
      }
      if (batch.length < EXPORT_BATCH) break;
      const last = batch[batch.length - 1];
      cursor = {
        s: 'timestamp',
        d: 'desc',
        t: new Date(last.crossed_at).toISOString(),
        i: Number(last.id),
      };
    }
    res.end();
  }

  exportOverload(user: JwtPayload, dto: CrossingFilterDto, res: Response) {
    return this.alertsService.exportCsv(
      user,
      this.overloadFilter(dto),
      res,
      'report-overload',
    );
  }

  // ----- helpers -----

  private overloadFilter(dto: CrossingFilterDto): AlertFilterDto {
    return {
      ...dto,
      exempt: false,
      type: ['AXLE_MISMATCH'],
      status: 'all',
    };
  }

  /**
   * Count and summed loss of alerts (any status) on the filtered crossings.
   */
  private async alertTotals(dto: CrossingFilterDto, scope: PlazaScope) {
    const { where, include } = this.alertsService.query(
      { ...dto, status: 'all' },
      scope,
      { withStatus: false, crossingAttributes: [] },
    );
    const row = (await this.alertModel.findOne({
      attributes: [
        [fn('COUNT', literal('*')), 'count'],
        [fn('COALESCE', fn('SUM', col('CrossingAlert.loss')), 0), 'loss'],
      ],
      where,
      include,
      raw: true,
    })) as unknown as { count: Num; loss: Num } | null;
    return { count: n(row?.count), loss: n(row?.loss) };
  }

  private async tagCounts(where: WhereOptions) {
    const rows = (await this.crossingModel.findAll({
      attributes: [
        [resolvedTag(), 'tag'],
        [fn('COUNT', literal('*')), 'count'],
        [fn('SUM', col('amount')), 'collection'],
      ],
      where,
      group: ['tag'],
      order: [[literal('`count`'), 'DESC']],
      raw: true,
    })) as unknown as { tag: Num; count: Num; collection: Num }[];
    return rows
      .filter((row) => row.tag !== null)
      .map((row) => ({
        tag_class: String(row.tag),
        count: n(row.count),
        collection: n(row.collection),
      }));
  }

  private async dailyRows(where: WhereOptions, scope: PlazaScope) {
    const rows = (await this.crossingModel.findAll({
      attributes: [
        [localDay(scope.timezone), 'day'],
        [localHour(scope.timezone), 'hour'],
        [fn('COUNT', literal('*')), 'count'],
        [fn('SUM', col('amount')), 'collection'],
        [fn('SUM', col('is_ev')), 'ev'],
        [fn('SUM', col('is_oos')), 'oos'],
        [fn('SUM', col('is_commercial')), 'commercial'],
        [fn('SUM', col('is_exempt')), 'exempt'],
      ],
      where,
      group: ['day', 'hour'],
      raw: true,
    })) as unknown as DayHourRow[];

    const days = new Map<
      string,
      DayTotals & { day: string; hours: number[] }
    >();
    for (const row of rows) {
      const item = days.get(row.day) ?? {
        day: row.day,
        ...emptyTotals(),
        hours: Array<number>(24).fill(0),
      };
      item.count += n(row.count);
      item.collection += n(row.collection);
      item.ev += n(row.ev);
      item.oos += n(row.oos);
      item.commercial += n(row.commercial);
      item.exempt += n(row.exempt);
      item.hours[n(row.hour)] += n(row.count);
      days.set(row.day, item);
    }
    return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  }
}
