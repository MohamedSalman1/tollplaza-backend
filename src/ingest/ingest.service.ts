import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Crossing } from '@app/entities/models/crossing.entity';
import { CrossingAlert } from '@app/entities/models/crossing-alert.entity';
import { DB_CONNECTION, INGEST } from '@app/entities/constants/constants';
import { IngestCrossingsDto } from './dto/ingest-crossings.dto';
import {
  enrichCrossing,
  parseCrossedAt,
  type CrossingRow,
} from './crossing-enricher';
import { PlazaContextService } from './plaza-context.service';
import { ReferenceService } from '../reference/reference.service';
import { computeAlerts, summarizeAlerts, type AlertDraft } from './alert-rules';
import {
  IngestEventsService,
  type StoredAlert,
  type StoredCrossing,
} from '../stream/ingest-events.service';

type Rejected = { source_id: string; reason: string };

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    @InjectModel(Crossing, DB_CONNECTION)
    private readonly crossingModel: typeof Crossing,
    @InjectModel(CrossingAlert, DB_CONNECTION)
    private readonly alertModel: typeof CrossingAlert,
    private readonly plazaContext: PlazaContextService,
    private readonly events: IngestEventsService,
    private readonly reference: ReferenceService,
  ) {}

  async ingestCrossings(dto: IngestCrossingsDto): Promise<{
    received: number;
    inserted: number;
    duplicates: number;
    alerts: number;
    rejected: Rejected[];
  }> {
    const context = await this.plazaContext.get(dto.plaza_code);
    if (!context) {
      throw new BadRequestException('Unknown or inactive plaza_code');
    }

    // 1. Enrich every item and run the alert rules; a bad row is rejected,
    // the rest still go in
    const rejected: Rejected[] = [];
    const rows = new Map<string, CrossingRow>();
    const alertsBySource = new Map<string, AlertDraft[]>();
    const reference = await this.reference.data();
    let duplicates = 0;

    for (const item of dto.crossings) {
      if (rows.has(item.id)) {
        duplicates++;
        continue;
      }
      // Check the timestamp first so a rejected row can't create a lane mapping
      if (!parseCrossedAt(item.timestamp, context.timezone)) {
        rejected.push({ source_id: item.id, reason: 'Invalid timestamp' });
        continue;
      }
      const lane = await this.plazaContext.resolveLane(
        context,
        item.camera_name?.trim() || null,
      );
      const row = enrichCrossing(item, { ...context, lane })!;
      const alerts = computeAlerts(row, context.prices, reference);
      Object.assign(row, summarizeAlerts(alerts));
      rows.set(item.id, row);
      alertsBySource.set(item.id, alerts);
    }

    // 2. Skip records already stored (camera service retries)
    if (rows.size) {
      const existing = await this.crossingModel.findAll({
        attributes: ['source_id'],
        where: {
          plaza_id: context.plaza_id,
          source_id: { [Op.in]: [...rows.keys()] },
        },
        raw: true,
      });
      for (const { source_id } of existing) {
        if (rows.delete(source_id)) {
          duplicates++;
        }
      }
    }

    const newRows = [...rows.values()];
    if (!newRows.length) {
      return {
        received: dto.crossings.length,
        inserted: 0,
        duplicates,
        alerts: 0,
        rejected,
      };
    }

    await this.logPossibleDuplicateCaptures(context.plaza_id, newRows);

    // 3. One transaction: a multi-row insert per table. The no-op ON
    // DUPLICATE KEY on both covers a retry that races this request between the
    // check above and the insert.
    const stored = await this.crossingModel.sequelize!.transaction(
      async (transaction) => {
        await this.crossingModel.bulkCreate(newRows, {
          updateOnDuplicate: ['source_id'],
          transaction,
        });

        // Ids from a bulk insert aren't reliable with ON DUPLICATE KEY, so
        // read them back by source_id
        const ids = await this.crossingModel.findAll({
          attributes: ['id', 'source_id'],
          where: {
            plaza_id: context.plaza_id,
            source_id: { [Op.in]: newRows.map((row) => row.source_id) },
          },
          raw: true,
          transaction,
        });
        const idBySource = new Map(ids.map((row) => [row.source_id, row.id]));
        const crossings: StoredCrossing[] = newRows.map((row) => ({
          ...row,
          id: Number(idBySource.get(row.source_id)),
        }));

        const alertRows = crossings.flatMap((row) =>
          alertsBySource.get(row.source_id)!.map((draft) => ({
            ...draft,
            crossing_id: row.id,
            plaza_id: context.plaza_id,
            crossed_at: row.crossed_at,
            lane_id: row.lane_id,
          })),
        );
        if (!alertRows.length) {
          return { crossings, alerts: [] as StoredAlert[] };
        }

        await this.alertModel.bulkCreate(alertRows, {
          updateOnDuplicate: ['type'],
          transaction,
        });
        const alertIds = await this.alertModel.findAll({
          attributes: ['id', 'crossing_id', 'type'],
          where: {
            crossing_id: {
              [Op.in]: [...new Set(alertRows.map((a) => a.crossing_id))],
            },
          },
          raw: true,
          transaction,
        });
        const alertId = new Map(
          alertIds.map((a) => [`${a.crossing_id}|${a.type}`, Number(a.id)]),
        );
        const alerts: StoredAlert[] = alertRows.map((alert) => ({
          ...alert,
          id: alertId.get(`${alert.crossing_id}|${alert.type}`)!,
        }));
        return { crossings, alerts };
      },
    );

    // 4. Live stream, only after the commit. The data is already stored, so
    // a publish failure only means stream clients miss it (they catch up via
    // /crossings/updates); it must not fail the request.
    try {
      await this.events.publish({ plaza_id: context.plaza_id, ...stored });
    } catch (error) {
      this.logger.error(`Could not publish ingest batch: ${String(error)}`);
    }

    return {
      received: dto.crossings.length,
      inserted: newRows.length,
      duplicates,
      alerts: stored.alerts.length,
      rejected,
    };
  }

  /**
   * Several cameras on one lane may each send a record for the same vehicle.
   * Until we know whether that happens, only log it: same plate, same lane,
   * within INGEST.duplicate_window_seconds. One query per batch.
   */
  private async logPossibleDuplicateCaptures(
    plazaId: number,
    rows: CrossingRow[],
  ) {
    const candidates = rows.filter(
      (row) => row.plate_normalized && row.lane_id,
    );
    if (!candidates.length) {
      return;
    }

    const windowMs = INGEST.duplicate_window_seconds * 1000;
    const times = candidates.map((row) => row.crossed_at.getTime());

    const stored = await this.crossingModel.findAll({
      attributes: ['source_id', 'plate_normalized', 'lane_id', 'crossed_at'],
      where: {
        plaza_id: plazaId,
        plate_normalized: {
          [Op.in]: [...new Set(candidates.map((row) => row.plate_normalized!))],
        },
        crossed_at: {
          [Op.between]: [
            new Date(Math.min(...times) - windowMs),
            new Date(Math.max(...times) + windowMs),
          ],
        },
      },
      raw: true,
    });

    const seen = [...stored, ...candidates];
    for (const row of candidates) {
      const match = seen.find(
        (other) =>
          other.source_id !== row.source_id &&
          other.plate_normalized === row.plate_normalized &&
          other.lane_id === row.lane_id &&
          Math.abs(
            new Date(other.crossed_at).getTime() - row.crossed_at.getTime(),
          ) <= windowMs,
      );
      if (match) {
        this.logger.warn(
          `Possible duplicate capture: plate ${row.plate_normalized} on lane ${row.lane_id}, source_id ${row.source_id} (${row.camera_name}) and ${match.source_id}`,
        );
      }
    }
  }
}
