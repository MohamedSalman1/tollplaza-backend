import { Injectable } from '@nestjs/common';
import { Subject, mergeMap, share, type Observable } from 'rxjs';
import {
  SessionService,
  type SessionRevokedEvent,
} from '@app/entities/services/session.service';
import {
  WatchlistService,
  type WatchMatch,
} from '../watchlist/watchlist.service';
import {
  IngestEventsService,
  type IngestBatchEvent,
} from './ingest-events.service';

export type StreamBatch = IngestBatchEvent & {
  watch: ReadonlyMap<string, WatchMatch>;
};

/**
 * Ingest batches with their watchlist matches. The lookup runs once per
 * batch however many clients are connected (`share`), and not at all when
 * nobody is.
 */
@Injectable()
export class StreamService {
  readonly batches$: Observable<StreamBatch>;
  // Logouts, from every app server; each connection checks if it's covered
  readonly revoked$ = new Subject<SessionRevokedEvent>();

  constructor(
    events: IngestEventsService,
    watchlist: WatchlistService,
    sessions: SessionService,
  ) {
    sessions.onRevoked((event) => this.revoked$.next(event));

    this.batches$ = events.batches$.pipe(
      mergeMap(async (batch) => ({
        ...batch,
        watch: await watchlist.lookup(
          batch.plaza_id,
          batch.crossings.map((crossing) => crossing.plate_normalized),
        ),
      })),
      share(),
    );
  }
}
