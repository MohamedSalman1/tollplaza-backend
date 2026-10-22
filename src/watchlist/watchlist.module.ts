import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { DB_CONNECTION } from '@app/entities/constants/constants';
import { Crossing } from '@app/entities/models/crossing.entity';
import { User } from '@app/entities/models/user.entity';
import { WatchlistEntry } from '@app/entities/models/watchlist-entry.entity';
import { PlazasModule } from '../plazas/plazas.module';
import { WatchlistController } from './watchlist.controller';
import { WatchlistService } from './watchlist.service';

@Module({
  imports: [
    SequelizeModule.forFeature([WatchlistEntry, Crossing, User], DB_CONNECTION),
    PlazasModule,
  ],
  controllers: [WatchlistController],
  providers: [WatchlistService],
  exports: [WatchlistService],
})
export class WatchlistModule {}
