import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, col, fn, literal, type WhereOptions } from 'sequelize';
import { Crossing } from '@app/entities/models/crossing.entity';
import { DB_CONNECTION } from '@app/entities/constants/constants';
import type { JwtPayload } from '@app/entities/interfaces/jwt-payload.interface';
import { CrossingFilterDto } from '@app/entities/query/crossing-filter.dto';
import { buildCrossingWhere } from '@app/entities/query/crossing-where';
import { formatInTz } from '@app/entities/utils/time';
import { PlazaAccessService } from '../plazas/plaza-access.service';

type SummaryRow = {
  total: number | string;
  collection: number | string;
  unique_states: number | string;
  unique_districts: number | string;
  oos: number | string | null;
  ev: number | string | null;
  exempt: number | string | null;
  last_crossing_at: Date | string | null;
};

type GroupRow = {
  key: string | number | null;
  count: number | string;
  collection?: number | string;
};

/**
 * Percentage with one decimal; 0 when there is nothing to divide by.
 */
export const pct = (part: number, whole: number) =>
  whole ? Math.round((part / whole) * 1000) / 10 : 0;

/**
 * Stats are live GROUP BYs on crossings, using the same WHERE as the list,
 * so the numbers always match the table.
 */
@Injectable()
export class CrossingStatsService {
  constructor(
    @InjectModel(Crossing, DB_CONNECTION)
    private readonly crossingModel: typeof Crossing,
    private readonly plazaAccess: PlazaAccessService,
  ) {}

  /**
   * KPI strip (#7). total_unfiltered is the same plaza and time range with
   * no other filters: the table's "showing X of Y".
   */
  async summary(user: JwtPayload, dto: CrossingFilterDto) {
    const scope = await this.plazaAccess.resolve(user, dto.plaza_id, dto.tz);
    const where = buildCrossingWhere(dto, scope);
    const timeOnlyWhere = buildCrossingWhere(dto, scope, { timeOnly: true });

    const [totals, byTag, topMake, topColor, totalUnfiltered] =
      await Promise.all([
        this.crossingModel.findOne({
          attributes: [
            [fn('COUNT', literal('*')), 'total'],
            [fn('COALESCE', fn('SUM', col('amount')), 0), 'collection'],
            [fn('COUNT', fn('DISTINCT', col('state_name'))), 'unique_states'],
            [fn('COUNT', fn('DISTINCT', col('district'))), 'unique_districts'],
            [fn('SUM', col('is_oos')), 'oos'],
            [fn('SUM', col('is_ev')), 'ev'],
            [fn('SUM', col('is_exempt')), 'exempt'],
            [fn('MAX', col('crossed_at')), 'last_crossing_at'],
          ],
          where,
          raw: true,
        }) as unknown as Promise<SummaryRow>,
        this.groupCount(where, 'tag_class', { withCollection: true }),
        this.groupCount(where, 'vehicle_make', { limit: 1, skipNull: true }),
        this.groupCount(where, 'vehicle_color', { limit: 1, skipNull: true }),
        this.crossingModel.count({ where: timeOnlyWhere }),
      ]);

    const total = Number(totals.total);
    const oos = Number(totals.oos ?? 0);
    const money = scope.can_see_money;

    return {
      total_crossings: total,
      total_unfiltered: totalUnfiltered,
      ...(money && { collection: Number(totals.collection) }),
      by_tag: byTag.map((row) => ({
        tag_class: row.key === null ? null : String(row.key),
        count: Number(row.count),
        ...(money && { collection: Number(row.collection ?? 0) }),
        share: pct(Number(row.count), total),
      })),
      unique_states: Number(totals.unique_states),
      unique_districts: Number(totals.unique_districts),
      oos: { count: oos, pct: pct(oos, total) },
      ev: Number(totals.ev ?? 0),
      exempt: Number(totals.exempt ?? 0),
      top_make: topValue(topMake),
      top_color: topValue(topColor),
      last_crossing_at: formatInTz(totals.last_crossing_at, scope.timezone),
    };
  }

  private groupCount(
    where: WhereOptions,
    column: string,
    options: { limit?: number; skipNull?: boolean; withCollection?: boolean },
  ) {
    return this.crossingModel.findAll({
      attributes: [
        [col(column), 'key'],
        [fn('COUNT', literal('*')), 'count'],
        ...(options.withCollection
          ? [[fn('SUM', col('amount')), 'collection'] as [any, string]]
          : []),
      ],
      where: options.skipNull
        ? { [Op.and]: [where, { [column]: { [Op.ne]: null } }] }
        : where,
      group: [column],
      order: [[literal('`count`'), 'DESC']],
      ...(options.limit && { limit: options.limit }),
      raw: true,
    }) as unknown as Promise<GroupRow[]>;
  }
}

function topValue(rows: GroupRow[]) {
  const top = rows[0];
  return top ? { value: String(top.key), count: Number(top.count) } : null;
}
