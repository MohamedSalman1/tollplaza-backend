import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';
import { SessionService, type SessionRevokedEvent } from './session.service';

// No redis.url: the in-memory fallback, same behaviour as Redis
const sessions = () =>
  new SessionService(new RedisService(new ConfigService({ redis: {} })));

const now = Math.floor(Date.now() / 1000);
const token = (overrides: Partial<JwtPayload> = {}): JwtPayload => ({
  sub: 7,
  email: 'ops@test.local',
  name: 'Ops',
  role: 'operator',
  jti: 'session-a',
  iat_ms: Date.now() - 1000,
  iat: now - 1,
  exp: now + 12 * 3600,
  ...overrides,
});

describe('SessionService', () => {
  it('ends one session only', async () => {
    const service = sessions();
    await service.revokeSession(token());
    expect(await service.isRevoked(token())).toBe(true);
    expect(await service.isRevoked(token({ jti: 'session-b' }))).toBe(false);
    expect(await service.isRevoked(token({ sub: 8 }))).toBe(false);
  });

  it('ends every session issued before "log out everywhere", not later ones', async () => {
    const service = sessions();
    await service.revokeAllSessions(token());
    expect(await service.isRevoked(token())).toBe(true);
    expect(await service.isRevoked(token({ jti: 'session-b' }))).toBe(true);
    // A login after the logout
    expect(
      await service.isRevoked(
        token({ jti: 'session-c', iat_ms: Date.now() + 5 }),
      ),
    ).toBe(false);
  });

  it('ends all sessions for an old token without jti', async () => {
    const service = sessions();
    const legacy = token({ jti: undefined, iat_ms: undefined });
    await service.revokeSession(legacy);
    expect(await service.isRevoked(legacy)).toBe(true);
    expect(await service.isRevoked(token({ jti: 'session-b' }))).toBe(true);
  });

  it('broadcasts revocations, and covers() matches the right tokens', async () => {
    const service = sessions();
    const events: SessionRevokedEvent[] = [];
    service.onRevoked((event) => events.push(event));

    await service.revokeSession(token());
    expect(events).toEqual([{ user_id: 7, jti: 'session-a' }]);
    expect(SessionService.covers(events[0], token())).toBe(true);
    expect(SessionService.covers(events[0], token({ jti: 'x' }))).toBe(false);

    await service.revokeAllSessions(token());
    expect(SessionService.covers(events[1], token({ jti: 'x' }))).toBe(true);
    expect(SessionService.covers(events[1], token({ sub: 8 }))).toBe(false);
  });
});
