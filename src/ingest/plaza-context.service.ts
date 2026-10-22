import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Plaza } from '@app/entities/models/plaza.entity';
import { PlazaPricing } from '@app/entities/models/plaza-pricing.entity';
import { Lane } from '@app/entities/models/lane.entity';
import { LaneCamera } from '@app/entities/models/lane-camera.entity';
import {
  ACTIVE_STATUS,
  DB_CONNECTION,
  INGEST,
} from '@app/entities/constants/constants';
import { laneNumberFromCamera } from './crossing-enricher';

type LaneRef = { id: number; name: string };

export type PlazaContext = {
  plaza_id: number;
  timezone: string;
  home_state_codes: ReadonlySet<string>;
  prices: ReadonlyMap<number, number>;
  // keyed by lowercase camera name (the DB collation is case-insensitive)
  cameras: Map<string, LaneRef>;
  lanes_by_number: Map<number, LaneRef>;
  loaded_at: number;
};

/**
 * Caches what ingest needs per plaza (plaza row, prices, lanes, camera
 * mappings) so storing a crossing doesn't read these tables every time.
 * Entries expire after INGEST.cache_ttl_seconds; call invalidate() after
 * changing prices or lanes so the change applies immediately.
 */
@Injectable()
export class PlazaContextService {
  private readonly logger = new Logger(PlazaContextService.name);
  private readonly byCode = new Map<string, PlazaContext>();
  private readonly unmappedCameras = new Set<string>();

  constructor(
    @InjectModel(Plaza, DB_CONNECTION)
    private readonly plazaModel: typeof Plaza,
    @InjectModel(PlazaPricing, DB_CONNECTION)
    private readonly pricingModel: typeof PlazaPricing,
    @InjectModel(Lane, DB_CONNECTION)
    private readonly laneModel: typeof Lane,
    @InjectModel(LaneCamera, DB_CONNECTION)
    private readonly laneCameraModel: typeof LaneCamera,
  ) {}

  /**
   * Returns null for an unknown or inactive plaza.
   */
  async get(plazaCode: string): Promise<PlazaContext | null> {
    const cached = this.byCode.get(plazaCode);
    if (
      cached &&
      Date.now() - cached.loaded_at < INGEST.cache_ttl_seconds * 1000
    ) {
      return cached;
    }

    const plaza = await this.plazaModel.findOne({
      where: { code: plazaCode, status: ACTIVE_STATUS },
    });
    if (!plaza) {
      this.byCode.delete(plazaCode);
      return null;
    }

    const [prices, lanes, cameras] = await Promise.all([
      this.pricingModel.findAll({ where: { plaza_id: plaza.id }, raw: true }),
      this.laneModel.findAll({ where: { plaza_id: plaza.id }, raw: true }),
      this.laneCameraModel.findAll({
        where: { plaza_id: plaza.id },
        raw: true,
      }),
    ]);

    const lanesById = new Map<number, LaneRef>(
      lanes.map((lane) => [lane.id, { id: lane.id, name: lane.name }]),
    );

    const context: PlazaContext = {
      plaza_id: plaza.id,
      timezone: plaza.timezone,
      home_state_codes: new Set(
        parseStateCodes(plaza.home_state_codes).map((code) =>
          code.toUpperCase(),
        ),
      ),
      prices: new Map(prices.map((row) => [row.vehicle_class, row.price])),
      cameras: new Map(
        cameras
          .filter((camera) => lanesById.has(camera.lane_id))
          .map((camera) => [
            camera.camera_name.toLowerCase(),
            lanesById.get(camera.lane_id)!,
          ]),
      ),
      lanes_by_number: new Map(
        lanes.map((lane) => [lane.number, lanesById.get(lane.id)!]),
      ),
      loaded_at: Date.now(),
    };

    this.byCode.set(plazaCode, context);
    return context;
  }

  invalidate(plazaId: number) {
    for (const [code, context] of this.byCode) {
      if (context.plaza_id === plazaId) {
        this.byCode.delete(code);
      }
    }
  }

  /**
   * Maps a camera to its lane. A camera seen for the first time is mapped by
   * the lane number in its name (creating the lane if needed); one without a
   * lane number stays unmapped until an admin adds the mapping.
   */
  async resolveLane(
    context: PlazaContext,
    cameraName: string | null,
  ): Promise<LaneRef | null> {
    if (!cameraName) {
      return null;
    }

    const key = cameraName.toLowerCase();
    const known = context.cameras.get(key);
    if (known) {
      return known;
    }

    const number = laneNumberFromCamera(cameraName);
    if (number === null) {
      const warnKey = `${context.plaza_id}:${key}`;
      if (!this.unmappedCameras.has(warnKey)) {
        this.unmappedCameras.add(warnKey);
        this.logger.warn(
          `Camera "${cameraName}" (plaza ${context.plaza_id}) has no lane number and no mapping; crossings are stored without a lane`,
        );
      }
      return null;
    }

    let lane = context.lanes_by_number.get(number);
    if (!lane) {
      const [created] = await this.laneModel.findOrCreate({
        where: { plaza_id: context.plaza_id, number },
        defaults: { name: `Lane ${number}` },
      });
      lane = { id: created.id, name: created.name };
      context.lanes_by_number.set(number, lane);
    }

    // Another request may have mapped this camera already; its mapping wins
    const [mapping] = await this.laneCameraModel.findOrCreate({
      where: { plaza_id: context.plaza_id, camera_name: cameraName },
      defaults: { lane_id: lane.id },
    });
    if (mapping.lane_id !== lane.id) {
      const mapped = await this.laneModel.findByPk(mapping.lane_id);
      if (mapped) {
        lane = { id: mapped.id, name: mapped.name };
      }
    }

    this.logger.log(
      `Mapped camera "${cameraName}" to ${lane.name} (plaza ${context.plaza_id})`,
    );
    context.cameras.set(key, lane);
    return lane;
  }
}

// MySQL returns JSON columns parsed; MariaDB (JSON = LONGTEXT) returns text
function parseStateCodes(value: string[] | string): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
