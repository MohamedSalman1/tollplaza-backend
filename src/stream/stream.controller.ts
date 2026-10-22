import {
  Controller,
  Query,
  Sse,
  UnauthorizedException,
  type MessageEvent,
} from '@nestjs/common';
import {
  filter,
  from,
  interval,
  map,
  merge,
  mergeMap,
  switchMap,
  timer,
  type Observable,
} from 'rxjs';
import { CurrentUser } from '@app/entities/decorators/current-user.decorator';
import type { JwtPayload } from '@app/entities/interfaces/jwt-payload.interface';
import type { CrossingFilterDto } from '@app/entities/query/crossing-filter.dto';
import type { CrossingAlert } from '@app/entities/models/crossing-alert.entity';
import {
  PlazaAccessService,
  type PlazaScope,
} from '../plazas/plaza-access.service';
import { LanesService } from '../lanes/lanes.service';
import { toListItem } from '../crossings/crossing.serializer';
import { toAlertFields } from '../alerts/alert.serializer';
import { StreamService, type StreamBatch } from './stream.service';
import { SessionService } from '@app/entities/services/session.service';
import { StreamDto } from './stream.dto';

const PING_MS = 25 * 1000;
const LANE_HEALTH_MS = 60 * 1000;

@Controller({ path: 'stream', version: '1' })
export class StreamController {
  constructor(
    private readonly streamService: StreamService,
    private readonly plazaAccess: PlazaAccessService,
    private readonly lanesService: LanesService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * GET /stream?plaza_id=1 (Server-Sent Events, Authorization header)
   *
   * Events: crossing.created, alert.created, watchlist.hit, lane.health
   * (on connect, then every minute) and ping (keep-alive). Each event is
   * shaped for this connection's role, so money stays hidden where it
   * should. The stream ends at once on logout, and within a minute when the
   * token expires or plaza access is revoked; the client then signs in or
   * reconnects.
   */
  @Sse()
  async stream(
    @CurrentUser() user: JwtPayload,
    @Query() streamDto: StreamDto,
  ): Promise<Observable<MessageEvent>> {
    let scope = await this.plazaAccess.resolve(
      user,
      streamDto.plaza_id,
      streamDto.tz,
    );
    const laneFilter = {
      plaza_id: scope.plaza_id,
      range: 'today',
    } as CrossingFilterDto;

    // Also re-checks the token and access, and refreshes lanes for the
    // serializer (a new camera can create a lane)
    const laneHealth$ = timer(0, LANE_HEALTH_MS).pipe(
      switchMap(async () => {
        if (Date.now() >= user.exp * 1000) {
          throw new UnauthorizedException('Token expired');
        }
        // Backstop for a logout broadcast this server missed
        if (await this.sessions.isRevoked(user)) {
          throw new UnauthorizedException('Session has ended');
        }
        scope = await this.plazaAccess.resolve(
          user,
          streamDto.plaza_id,
          streamDto.tz,
        );
        const data = await this.lanesService.health(scope, laneFilter);
        return { type: 'lane.health', data } satisfies MessageEvent;
      }),
    );

    const ping$ = interval(PING_MS).pipe(
      map(() => ({ type: 'ping', data: {} }) satisfies MessageEvent),
    );

    const events$ = this.streamService.batches$.pipe(
      filter((batch) => batch.plaza_id === scope.plaza_id),
      mergeMap((batch) => from(toMessages(batch, scope))),
    );

    const loggedOut$ = this.streamService.revoked$.pipe(
      filter((event) => SessionService.covers(event, user)),
      map((): MessageEvent => {
        throw new UnauthorizedException('Session has ended');
      }),
    );

    return merge(laneHealth$, ping$, events$, loggedOut$);
  }
}

function toMessages(batch: StreamBatch, scope: PlazaScope): MessageEvent[] {
  const messages: MessageEvent[] = [];
  const items = new Map<number, ReturnType<typeof toListItem>>();

  for (const crossing of batch.crossings) {
    const item = toListItem(crossing, scope, batch.watch);
    items.set(crossing.id, item);
    messages.push({ type: 'crossing.created', id: item.id, data: item });
  }

  for (const alert of batch.alerts) {
    messages.push({
      type: 'alert.created',
      data: {
        ...toAlertFields(
          {
            ...alert,
            status: 'open',
            reviewer: undefined,
            reviewed_at: null,
            review_note: null,
          } as unknown as CrossingAlert,
          scope,
        ),
        crossing_id: String(alert.crossing_id),
      },
    });
  }

  for (const crossing of batch.crossings) {
    const match = crossing.plate_normalized
      ? batch.watch.get(crossing.plate_normalized)
      : undefined;
    if (match) {
      messages.push({
        type: 'watchlist.hit',
        data: {
          crossing: items.get(crossing.id),
          watchlist: {
            id: match.id,
            category: match.category,
            note: match.note,
          },
        },
      });
    }
  }
  return messages;
}
