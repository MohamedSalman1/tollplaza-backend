import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, col, fn, literal, type WhereOptions } from 'sequelize';
import { Crossing } from '@app/entities/models/crossing.entity';
import { LaneCamera } from '@app/entities/models/lane-camera.entity';
import { DB_CONNECTION, LANE_HEALTH } from '@app/entities/constants/constants';
import { CrossingFilterDto } from '@app/entities/query/crossing-filter.dto';
import { buildCrossingWhere } from '@app/entities/query/crossing-where';
import { formatInTz } from '@app/entities/utils/time';
import type { PlazaScope } from '../plazas/plaza-access.service';

type LaneCount = { lane_id: number | null; value: number | string | Date };

export type LaneStatus = 'ok' | 'stale' | 'down';

const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class LanesService {
  constructor(
    @InjectModel(Crossing, DB_CONNECTION)
    private readonly crossingModel: typeof Crossing,
    @InjectModel(LaneCamera, DB_CONNECTION)
    private readonly laneCameraModel: typeof LaneCamera,
  ) {}

  /**
   * Per lane: cameras, last crossing (all time), crossings in the last hour,
   * crossings and watchlist hits in the filtered range, and a status from
   * how long ago the last crossing was. The caller has resolved access.
   */
  async health(scope: PlazaScope, dto: CrossingFilterDto) {
    const plaza = { plaza_id: scope.plaza_id };
    const now = Date.now();

    const [cameras, last, lastHour, inRange, hits] = await Promise.all([
      this.laneCameraModel.findAll({
        attributes: ['lane_id', 'camera_name'],
        where: plaza,
        order: [['camera_name', 'ASC']],
        raw: true,
      }),
      // One index seek per lane on (plaza_id, lane_id, crossed_at)
      this.perLane(plaza, fn('MAX', col('crossed_at'))),
      this.perLane(
        { ...plaza, crossed_at: { [Op.gte]: new Date(now - HOUR_MS) } },
        fn('COUNT', literal('*')),
      ),
      this.perLane(buildCrossingWhere(dto, scope), fn('COUNT', literal('*'))),
      this.perLane(
        buildCrossingWhere({ ...dto, watchlist: true }, scope),
        fn('COUNT', literal('*')),
      ),
    ]);

    const byLane = (rows: LaneCount[]) =>
      new Map(rows.map((row) => [row.lane_id, row.value]));
    const lastAt = byLane(last);
    const hourCounts = byLane(lastHour);
    const rangeCounts = byLane(inRange);
    const hitCounts = byLane(hits);

    const lanes = [...scope.lanes_by_id.values()]
      .sort((a, b) => a.number - b.number)
      .map((lane) => {
        const lastCrossing = lastAt.get(lane.id);
        const lastMs = lastCrossing ? new Date(lastCrossing).getTime() : null;
        const secondsSince =
          lastMs === null
            ? null
            : Math.max(0, Math.round((now - lastMs) / 1000));
        return {
          id: lane.id,
          number: lane.number,
          name: lane.name,
          cameras: cameras
            .filter((camera) => camera.lane_id === lane.id)
            .map((camera) => camera.camera_name),
          last_crossing_at:
            lastMs === null
              ? null
              : formatInTz(new Date(lastMs), scope.timezone),
          seconds_since_last: secondsSince,
          status: laneStatus(secondsSince),
          crossings_last_hour: Number(hourCounts.get(lane.id) ?? 0),
          crossings_in_range: Number(rangeCounts.get(lane.id) ?? 0),
          watchlist_hits: Number(hitCounts.get(lane.id) ?? 0),
        };
      });

    return { lanes };
  }

  private perLane(
    where: WhereOptions,
    value: ReturnType<typeof fn>,
  ): Promise<LaneCount[]> {
    return this.crossingModel.findAll({
      attributes: ['lane_id', [value, 'value']],
      where,
      group: ['lane_id'],
      raw: true,
    }) as unknown as Promise<LaneCount[]>;
  }
}

export function laneStatus(secondsSince: number | null): LaneStatus {
  if (secondsSince === null) return 'down';
  if (secondsSince < LANE_HEALTH.ok_under_seconds) return 'ok';
  if (secondsSince < LANE_HEALTH.stale_under_seconds) return 'stale';
  return 'down';
}
