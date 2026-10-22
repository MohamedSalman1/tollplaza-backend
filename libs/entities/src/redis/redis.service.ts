import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import Redis from 'ioredis';

type Handler = (payload: unknown) => void;

const COMMAND_TIMEOUT_MS = 1000;

/**
 * Pub/sub and expiring keys, on Redis when `redis.url` is set, otherwise in
 * memory (one app server only, e.g. local development). Every key and
 * channel gets `redis.key_prefix`. Payloads are JSON, so Dates arrive as
 * ISO strings on the subscriber side.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly prefix: string;
  private readonly client: Redis | null;
  private subscriber: Redis | null = null;
  private readonly handlers = new Map<string, Set<Handler>>();

  // In-memory fallback
  private readonly local = new EventEmitter();
  private readonly localKeys = new Map<
    string,
    { value: string; expires_at: number }
  >();

  constructor(config: ConfigService) {
    const url = config.get<string>('redis.url', '');
    this.prefix = config.get<string>('redis.key_prefix', 'tollplaza:');
    this.client = url ? this.connect(url, 'commands') : null;
    this.local.setMaxListeners(0);
    if (!this.client) {
      this.logger.warn(
        'redis.url is not set: using in-memory pub/sub and keys (single app server only)',
      );
    }
  }

  get enabled() {
    return this.client !== null;
  }

  async publish(channel: string, payload: unknown) {
    if (this.client) {
      await this.client.publish(this.prefix + channel, JSON.stringify(payload));
    } else {
      // Round-trip through JSON so both modes deliver the same shapes
      this.local.emit(channel, JSON.parse(JSON.stringify(payload)));
    }
  }

  subscribe(channel: string, handler: Handler) {
    if (!this.client) {
      this.local.on(channel, handler);
      return;
    }
    const handlers = this.handlers.get(channel) ?? new Set<Handler>();
    handlers.add(handler);
    this.handlers.set(channel, handlers);

    if (!this.subscriber) {
      // A subscribed connection can't run other commands, so it's separate
      this.subscriber = this.client.duplicate();
      this.subscriber.on('error', (error) =>
        this.logger.error(`Redis subscriber: ${error.message}`),
      );
      this.subscriber.on('message', (fullChannel: string, message: string) => {
        const name = fullChannel.slice(this.prefix.length);
        let payload: unknown;
        try {
          payload = JSON.parse(message);
        } catch {
          return;
        }
        for (const fn of this.handlers.get(name) ?? []) fn(payload);
      });
    }
    void this.subscriber.subscribe(this.prefix + channel);
  }

  async set(key: string, value: string, ttlSeconds: number) {
    const ttl = Math.max(1, Math.ceil(ttlSeconds));
    if (this.client) {
      await this.client.set(this.prefix + key, value, 'EX', ttl);
    } else {
      this.localKeys.set(key, { value, expires_at: Date.now() + ttl * 1000 });
    }
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    if (this.client) {
      return this.client.mget(keys.map((key) => this.prefix + key));
    }
    const now = Date.now();
    return keys.map((key) => {
      const entry = this.localKeys.get(key);
      if (!entry) return null;
      if (entry.expires_at <= now) {
        this.localKeys.delete(key);
        return null;
      }
      return entry.value;
    });
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.client?.quit(), this.subscriber?.quit()]);
  }

  private connect(url: string, name: string) {
    const client = new Redis(url, {
      commandTimeout: COMMAND_TIMEOUT_MS,
      maxRetriesPerRequest: 1,
    });
    // Without a listener ioredis treats errors as unhandled
    client.on('error', (error) =>
      this.logger.error(`Redis ${name}: ${error.message}`),
    );
    client.on('ready', () => this.logger.log(`Redis ${name} connected`));
    return client;
  }
}
