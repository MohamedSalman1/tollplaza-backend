import { Module } from '@nestjs/common';
import { PlazasModule } from '../plazas/plazas.module';
import { LanesModule } from '../lanes/lanes.module';
import { WatchlistModule } from '../watchlist/watchlist.module';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';

@Module({
  imports: [PlazasModule, LanesModule, WatchlistModule],
  controllers: [StreamController],
  providers: [StreamService],
})
export class StreamModule {}
