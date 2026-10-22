import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { DB_CONNECTION } from '@app/entities/constants/constants';
import { Crossing } from '@app/entities/models/crossing.entity';
import { CrossingAlert } from '@app/entities/models/crossing-alert.entity';
import { User } from '@app/entities/models/user.entity';
import { PlazasModule } from '../plazas/plazas.module';
import { WatchlistModule } from '../watchlist/watchlist.module';
import { ReferenceModule } from '../reference/reference.module';
import { CrossingsController } from './crossings.controller';
import { CrossingStatsController } from './crossing-stats.controller';
import { CrossingsService } from './crossings.service';
import { CrossingStatsService } from './crossing-stats.service';
import { CrossingAnalyticsService } from './crossing-analytics.service';

@Module({
  imports: [
    SequelizeModule.forFeature([Crossing, CrossingAlert, User], DB_CONNECTION),
    PlazasModule,
    WatchlistModule,
    ReferenceModule,
  ],
  // Stats first: its static routes must register before /crossings/:id
  controllers: [CrossingStatsController, CrossingsController],
  providers: [CrossingsService, CrossingStatsService, CrossingAnalyticsService],
})
export class CrossingsModule {}
