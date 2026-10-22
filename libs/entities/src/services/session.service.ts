import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

export type SessionRevokedEvent = {
  user_id: number;
  // One session (logout)
  jti?: string;
  // Every session issued before this time, in ms (logout everywhere)
  before_ms?: number;
};

const REVOKED_CHANNEL = 'auth.revoked';
// Scoped by user as well, so a revocation can only ever hit that user's token
const sessionKey = (userId: number, jti: string) =>
  `session:revoked:${userId}:${jti}`;
const userKey = (userId: number) => `session:user:${userId}:revoked_before`;

/**
 * Revoked sessions, so a logged-out token stops working before it expires.
 * Keys expire with the tokens they cover, so nothing has to be cleaned up.
 * Revocations are also broadcast, so open live streams close at once.
 */
@Injectable()
export class SessionService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Ends this one session (the token's jti) until the token would expire.
   */
  async revokeSession(user: JwtPayload) {
    if (!user.jti) {
      // Tokens issued before jti existed can only be ended all together
      return this.revokeAllSessions(user);
    }
    await this.redis.set(
      sessionKey(user.sub, user.jti),
      '1',
      user.exp - nowSeconds(),
    );
    await this.redis.publish(REVOKED_CHANNEL, {
      user_id: user.sub,
      jti: user.jti,
    } satisfies SessionRevokedEvent);
  }

  /**
   * Ends every session the user has open right now. Tokens issued later
   * (a new login) are not affected.
   */
  async revokeAllSessions(user: JwtPayload) {
    const before = Date.now();
    // Every token has the same lifetime, so after that no older token is left
    const lifetime = user.exp - user.iat;
    await this.redis.set(userKey(user.sub), String(before), lifetime);
    await this.redis.publish(REVOKED_CHANNEL, {
      user_id: user.sub,
      before_ms: before,
    } satisfies SessionRevokedEvent);
  }

  async isRevoked(user: JwtPayload): Promise<boolean> {
    const [session, before] = await this.redis.mget([
      user.jti ? sessionKey(user.sub, user.jti) : userKey(user.sub),
      userKey(user.sub),
    ]);
    return (
      (user.jti !== undefined && session !== null) ||
      (before !== null && issuedAtMs(user) < Number(before))
    );
  }

  onRevoked(handler: (event: SessionRevokedEvent) => void) {
    this.redis.subscribe(REVOKED_CHANNEL, (payload) =>
      handler(payload as SessionRevokedEvent),
    );
  }

  /**
   * Whether a broadcast revocation covers this token.
   */
  static covers(event: SessionRevokedEvent, user: JwtPayload) {
    if (event.user_id !== user.sub) return false;
    if (event.jti) return event.jti === user.jti;
    return event.before_ms !== undefined && issuedAtMs(user) < event.before_ms;
  }
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

// iat is in whole seconds; iat_ms (set at login) avoids treating a login in
// the same second as a "log out everywhere" as revoked
function issuedAtMs(user: JwtPayload) {
  return user.iat_ms ?? user.iat * 1000;
}
