import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { RedisService } from '@app/entities/redis/redis.service';
import type { CrossingRow } from '../ingest/crossing-enricher';
import type { AlertDraft } from '../ingest/alert-rules';

export type StoredCrossing = CrossingRow & { id: number };
export type StoredAlert = AlertDraft & {
  id: number;
  crossing_id: number;
  crossed_at: Date;
};

/**
 * One committed ingest batch for one plaza.
 */
export type IngestBatchEvent = {
  plaza_id: number;
  crossings: StoredCrossing[];
  alerts: StoredAlert[];
};

const CHANNEL = 'ingest.batch';

/**
 * Bus from ingest to the live stream, over Redis pub/sub, so a crossing
 * ingested on one app server reaches stream clients on every server. (In
 * memory when Redis isn't configured.) Ingest publishes after its
 * transaction commits.
 */
@Injectable()
export class IngestEventsService {
  private readonly batches = new Subject<IngestBatchEvent>();
  readonly batches$ = this.batches.asObservable();

  constructor(private readonly redis: RedisService) {
    redis.subscribe(CHANNEL, (payload) =>
      this.batches.next(revive(payload as IngestBatchEvent)),
    );
  }

  async publish(event: IngestBatchEvent) {
    if (event.crossings.length) {
      await this.redis.publish(CHANNEL, event);
    }
  }
}

// JSON turns Dates into strings; restore the ones the stream formats
function revive(event: IngestBatchEvent): IngestBatchEvent {
  return {
    ...event,
    crossings: event.crossings.map((crossing) => ({
      ...crossing,
      crossed_at: new Date(crossing.crossed_at),
    })),
    alerts: event.alerts.map((alert) => ({
      ...alert,
      crossed_at: new Date(alert.crossed_at),
    })),
  };
}
