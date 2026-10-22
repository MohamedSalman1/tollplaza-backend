import { Global, Module } from '@nestjs/common';
import { IngestEventsService } from './ingest-events.service';

/**
 * Global and dependency-free so ingest can publish without importing the
 * stream (which depends on watchlist and plazas).
 */
@Global()
@Module({
  providers: [IngestEventsService],
  exports: [IngestEventsService],
})
export class IngestEventsModule {}
