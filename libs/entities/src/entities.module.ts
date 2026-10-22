import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis/redis.service';
import { SessionService } from './services/session.service';

/**
 * Shared infrastructure, global so middlewares and any module can inject it.
 */
@Global()
@Module({
  providers: [RedisService, SessionService],
  exports: [RedisService, SessionService],
})
export class EntitiesModule {}
