import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  Op,
  col,
  fn,
  literal,
  type Includeable,
  type WhereOptions,
} from 'sequelize';
import type { Response } from 'express';
import { Crossing } from '@app/entities/models/crossing.entity';
import { CrossingAlert } from '@app/entities/models/crossing-alert.entity';
import { User } from '@app/entities/models/user.entity';
import {
  ALERT_SEVERITIES,
  ALERT_TYPES,
  DEFAULT_ALERT_KIND,
  SOFT_ALERT_TYPES,
  alertKindOf,
  type AlertType,
  DB_CONNECTION,
  PAGINATION,
} from '@app/entities/constants/constants';
import type { JwtPayload } from '@app/entities/interfaces/jwt-payload.interface';
import {
  buildCrossingWhere,
  hasCrossingFilters,
  resolveTimeWindow,
} from '@app/entities/query/crossing-where';
import {
  decodeCursor,
  encodeCursor,
  keysetWhere,
  type CursorPayload,
} from '@app/entities/query/cursor';
import { formatInTz } from '@app/entities/utils/time';
import { csvLine, startCsv } from '@app/entities/utils/csv';
import {
  PlazaAccessService,
  type PlazaScope,
} from '../plazas/plaza-access.service';
import {
  LIST_ATTRIBUTES,
  toListItem,
  type WatchMatches,
} from '../crossings/crossing.serializer';
import { WatchlistService } from '../watchlist/watchlist.service';
import { ReferenceService } from '../reference/reference.service';
import { pct } from '../crossings/crossing-stats.service';
import { toAlertFields } from './alert.serializer';
import { AlertFilterDto } from './dto/alert-filter.dto';
import { ListAlertsDto } from './dto/list-alerts.dto';
import { ReviewAlertsDto } from './dto/review-alerts.dto';

// Alerts are always listed most severe first, then newest first
const SORT = 'severity';
const DIR = 'desc';
const ORDER: [string, string][] = [
  ['severity_rank', 'DESC'],
  ['crossed_at', 'DESC'],
  ['id', 'DESC'],
];

const EXPORT_BATCH = 1000;
const BY_LANE_LIMIT = 8;

type GroupRow = {
  severity: string;
  type: string;
  lane_id: number | null;
  status: string;
  count: number | string;
  loss: number | string | null;
};

@Injectable()
export class AlertsService {
  constructor(
    @InjectModel(CrossingAlert, DB_CONNECTION)
    private readonly alertModel: typeof CrossingAlert,
    @InjectModel(Crossing, DB_CONNECTION)
    private readonly crossingModel: typeof Crossing,
    private readonly plazaAccess: PlazaAccessService,
    private readonly watchlist: WatchlistService,
    private readonly reference: ReferenceService,
  ) {}

  async list(user: JwtPayload, dto: ListAlertsDto) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);
    const limit = dto.limit ?? PAGINATION.default_limit;
    const cursor = dto.cursor ? decodeCursor(dto.cursor, SORT, DIR) : null;

    const alerts = await this.page(dto, scope, cursor, limit + 1);
    const page = alerts.slice(0, limit);
    const watch = await this.watchlist.lookup(
      scope.plaza_id,
      page.map((alert) => alert.crossing?.plate_normalized ?? null),
    );
    const last = page[page.length - 1];

    return {
      items: page.map((alert) => this.toItem(alert, scope, watch)),
      next_cursor:
        alerts.length > limit && last ? this.cursorAfter(last) : null,
    };
  }

  /**
   * KPIs and side panels for the alerts tab. Reports open and reviewed
   * together, so `status` is ignored; the other filters apply. Everything
   * is for `alert_kind` (hard by default) except `by_kind`, which always
   * shows both, so the UI can say how many soft alerts are hidden.
   */
  async summary(user: JwtPayload, dto: AlertFilterDto) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);
    const kind = dto.alert_kind ?? DEFAULT_ALERT_KIND;
    const { where, include } = this.query(dto, scope, {
      withStatus: false,
      crossingAttributes: [],
      ignoreKind: true,
    });
    const kindQuery = this.query(dto, scope, {
      withStatus: false,
      crossingAttributes: [],
    });

    const [groups, totalFlagged, crossingsScanned] = await Promise.all([
      // One small grouped query; everything below is folded from it
      this.alertModel.findAll({
        attributes: [
          'severity',
          'type',
          [col('CrossingAlert.lane_id'), 'lane_id'],
          'status',
          [fn('COUNT', literal('*')), 'count'],
          [fn('SUM', col('CrossingAlert.loss')), 'loss'],
        ],
        where,
        include,
        group: ['severity', 'type', col('CrossingAlert.lane_id'), 'status'],
        raw: true,
      }) as unknown as Promise<GroupRow[]>,
      this.alertModel.count({
        where: kindQuery.where,
        include: kindQuery.include,
        distinct: true,
        col: 'crossing_id',
      }),
      this.crossingModel.count({ where: buildCrossingWhere(dto, scope) }),
    ]);

    let total = 0;
    let open = 0;
    let criticalOpen = 0;
    let loss = 0;
    let exemptAnomalies = 0;
    const bySeverity = new Map(
      ALERT_SEVERITIES.map((severity) => [severity, { count: 0, open: 0 }]),
    );
    const byType = new Map(
      ALERT_TYPES.map((type) => [type, { count: 0, open: 0, loss: 0 }]),
    );
    const byLane = new Map<number | null, { count: number; open: number }>();
    const byKind = {
      hard: { count: 0, open: 0 },
      soft: { count: 0, open: 0 },
    };

    for (const group of groups) {
      const count = Number(group.count);
      const groupLoss = Number(group.loss ?? 0);
      const isOpen = group.status === 'open';
      const groupKind = alertKindOf(group.type as AlertType);
      byKind[groupKind].count += count;
      if (isOpen) byKind[groupKind].open += count;
      if (kind !== 'all' && kind !== groupKind) {
        continue;
      }
      total += count;
      loss += groupLoss;
      if (isOpen) {
        open += count;
        if (group.severity === 'HIGH') criticalOpen += count;
      }
      if (group.type === 'EXEMPT_ANOMALY') exemptAnomalies += count;

      const severity = bySeverity.get(group.severity as never);
      if (severity) {
        severity.count += count;
        if (isOpen) severity.open += count;
      }
      const type = byType.get(group.type as never);
      if (type) {
        type.count += count;
        type.loss += groupLoss;
        if (isOpen) type.open += count;
      }
      const lane = byLane.get(group.lane_id) ?? { count: 0, open: 0 };
      lane.count += count;
      if (isOpen) lane.open += count;
      byLane.set(group.lane_id, lane);
    }

    const money = scope.can_see_money;
    const lanes = [...byLane.entries()]
      .filter(([, lane]) => lane.open > 0)
      .sort((a, b) => b[1].open - a[1].open)
      .slice(0, BY_LANE_LIMIT)
      .map(([laneId, lane]) => ({
        lane: laneId === null ? null : (scope.lanes_by_id.get(laneId) ?? null),
        open: lane.open,
        count: lane.count,
      }));

    return {
      alert_kind: kind,
      open,
      total_alerts: total,
      // Crossings with at least one alert
      total_flagged: totalFlagged,
      critical_open: criticalOpen,
      ...(money && { estimated_loss: loss }),
      worst_lane: lanes[0] ?? null,
      exempt_anomalies: exemptAnomalies,
      reviewed: { count: total - open, pct: pct(total - open, total) },
      crossings_scanned: crossingsScanned,
      by_severity: [...bySeverity].map(([severity, counts]) => ({
        severity,
        ...counts,
      })),
      by_lane: lanes,
      by_type: [...byType].map(([type, counts]) => ({
        type,
        count: counts.count,
        open: counts.open,
        ...(money && { loss: counts.loss }),
      })),
      by_kind: byKind,
    };
  }

  /**
   * Marks alerts reviewed (or re-opens them) for every operator, recording
   * who and when. Only alerts whose status actually changes are updated.
   */
  async review(user: JwtPayload, dto: ReviewAlertsDto) {
    if (!dto.alert_ids?.length && !dto.crossing_ids?.length) {
      throw new BadRequestException('Send alert_ids, crossing_ids or both');
    }

    const target: WhereOptions = {
      [Op.or]: [
        ...(dto.alert_ids?.length ? [{ id: { [Op.in]: dto.alert_ids } }] : []),
        ...(dto.crossing_ids?.length
          ? [{ crossing_id: { [Op.in]: dto.crossing_ids } }]
          : []),
      ],
      status: dto.reviewed ? 'open' : 'reviewed',
    };

    // Every plaza touched must be one the user can see
    const plazas = (await this.alertModel.findAll({
      attributes: [[fn('DISTINCT', col('plaza_id')), 'plaza_id']],
      where: target,
      raw: true,
    })) as unknown as { plaza_id: number }[];
    await Promise.all(
      plazas.map(({ plaza_id }) => this.plazaAccess.resolve(user, plaza_id)),
    );
    if (!plazas.length) {
      return { updated: 0 };
    }

    const [updated] = await this.alertModel.update(
      dto.reviewed
        ? {
            status: 'reviewed',
            reviewed_by: user.sub,
            reviewed_at: new Date(),
            review_note: dto.note ?? null,
          }
        : {
            status: 'open',
            reviewed_by: null,
            reviewed_at: null,
            review_note: null,
          },
      { where: target },
    );
    return { updated };
  }

  /**
   * Streams the filtered alerts as CSV in keyset batches, so a large export
   * never sits in memory. Same columns as the dashboard's export.
   */
  async exportCsv(
    user: JwtPayload,
    dto: AlertFilterDto,
    res: Response,
    filename = 'alerts',
  ) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);
    const money = scope.can_see_money;
    const reference = await this.reference.data();

    const headers = [
      'id',
      'timestamp',
      'lane',
      'plate',
      'vehicle_class',
      'vehicle_class_name',
      'axles',
      'description',
      'charged_tag',
      'expected_tag',
      ...(money ? ['est_loss_inr'] : []),
      'severity',
      'alert_type',
      'reason',
      'status',
      'state',
      'district',
      'rto_code',
    ];

    startCsv(res, `${filename}-${scope.plaza_id}`, headers);

    let cursor: CursorPayload | null = null;
    for (;;) {
      const batch = await this.page(dto, scope, cursor, EXPORT_BATCH, [
        'rto_code',
      ]);
      for (const alert of batch) {
        const crossing = alert.crossing!;
        const lane = crossing.lane_id
          ? scope.lanes_by_id.get(crossing.lane_id)
          : undefined;
        res.write(
          csvLine([
            alert.id,
            formatInTz(crossing.crossed_at, scope.timezone),
            lane?.name ?? crossing.camera_name,
            crossing.license_plate,
            crossing.vehicle_class,
            crossing.vehicle_class === null
              ? ''
              : (reference.classes.get(crossing.vehicle_class)?.name ?? ''),
            crossing.axles,
            crossing.description,
            alert.charged_tag,
            alert.expected_tag,
            ...(money ? [alert.loss] : []),
            alert.severity,
            alert.type,
            alert.reason,
            alert.status,
            crossing.state_name,
            crossing.district,
            crossing.rto_code,
          ]),
        );
      }
      if (batch.length < EXPORT_BATCH) {
        break;
      }
      cursor = this.cursorPayload(batch[batch.length - 1]);
    }
    res.end();
  }

  /**
   * Alert-level filters on crossing_alerts (plaza, time, severity, type,
   * status, focus), plus a join to crossings for the crossing filters.
   * `crossingAttributes: []` joins for filtering only.
   */
  query(
    dto: AlertFilterDto,
    scope: PlazaScope,
    options: {
      withStatus: boolean;
      crossingAttributes?: string[];
      // Leave alert_kind out (the summary folds kinds itself)
      ignoreKind?: boolean;
    },
  ): { where: WhereOptions; include: Includeable[] } {
    const { start, end } = resolveTimeWindow(dto, scope.timezone);
    const and: WhereOptions[] = [{ plaza_id: scope.plaza_id }];
    if (start) and.push({ crossed_at: { [Op.gte]: start } });
    if (end) and.push({ crossed_at: { [Op.lt]: end } });
    if (dto.severity?.length) {
      and.push({ severity: { [Op.in]: dto.severity } });
    }
    if (dto.type?.length) {
      and.push({ type: { [Op.in]: dto.type } });
    }
    const status = dto.status ?? 'open';
    if (options.withStatus && status !== 'all') {
      and.push({ status });
    }
    const kind = dto.alert_kind ?? DEFAULT_ALERT_KIND;
    if (!options.ignoreKind && kind !== 'all') {
      and.push({
        type: {
          [kind === 'hard' ? Op.notIn : Op.in]: [...SOFT_ALERT_TYPES],
        },
      });
    }
    if (dto.focus === 'exempt') {
      and.push({
        [Op.or]: [{ type: 'EXEMPT_ANOMALY' }, { '$crossing.is_exempt$': true }],
      });
    } else if (dto.focus) {
      // Exact tag, or e.g. "7+" for description mismatches
      and.push({ expected_tag: { [Op.in]: [dto.focus, `${dto.focus}+`] } });
    }

    const needsCrossing =
      options.crossingAttributes?.length !== 0 ||
      hasCrossingFilters(dto) ||
      dto.focus === 'exempt';

    return {
      where: { [Op.and]: and },
      include: needsCrossing
        ? [
            {
              model: Crossing,
              as: 'crossing',
              attributes: options.crossingAttributes ?? [...LIST_ATTRIBUTES],
              where: hasCrossingFilters(dto)
                ? buildCrossingWhere(dto, scope)
                : undefined,
              required: true,
            },
          ]
        : [],
    };
  }

  private page(
    dto: AlertFilterDto,
    scope: PlazaScope,
    cursor: CursorPayload | null,
    limit: number,
    extraCrossingAttributes: string[] = [],
  ) {
    const { where, include } = this.query(dto, scope, {
      withStatus: true,
      crossingAttributes: [...LIST_ATTRIBUTES, ...extraCrossingAttributes],
    });

    return this.alertModel.findAll({
      where: cursor
        ? { [Op.and]: [where, keysetWhere('severity_rank', DIR, cursor)] }
        : where,
      include: [
        ...include,
        {
          model: User,
          as: 'reviewer',
          attributes: ['id', 'name'],
          required: false,
        },
      ],
      order: ORDER,
      limit,
    });
  }

  private toItem(alert: CrossingAlert, scope: PlazaScope, watch: WatchMatches) {
    return {
      ...toAlertFields(alert, scope),
      crossing: toListItem(
        alert.crossing!.get({ plain: true }) as Crossing,
        scope,
        watch,
      ),
    };
  }

  private cursorPayload(alert: CrossingAlert): CursorPayload {
    return {
      s: SORT,
      d: DIR,
      v: alert.severity_rank,
      t: new Date(alert.crossed_at).toISOString(),
      i: Number(alert.id),
    };
  }

  private cursorAfter(alert: CrossingAlert) {
    return encodeCursor(this.cursorPayload(alert));
  }
}
