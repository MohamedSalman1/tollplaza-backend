import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { DB_CONNECTION } from '@app/entities/constants/constants';
import { Crossing } from '@app/entities/models/crossing.entity';
import { CrossingAlert } from '@app/entities/models/crossing-alert.entity';
import { User } from '@app/entities/models/user.entity';
import { PlazasModule } from '../plazas/plazas.module';
import { WatchlistModule } from '../watchlist/watchlist.module';
import { ReferenceModule } from '../reference/reference.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

@Module({
  imports: [
    SequelizeModule.forFeature([CrossingAlert, Crossing, User], DB_CONNECTION),
    PlazasModule,
    WatchlistModule,
    ReferenceModule,
  ],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
