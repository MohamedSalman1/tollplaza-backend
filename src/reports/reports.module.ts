import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { DB_CONNECTION } from '@app/entities/constants/constants';
import { Crossing } from '@app/entities/models/crossing.entity';
import { CrossingAlert } from '@app/entities/models/crossing-alert.entity';
import { PlazasModule } from '../plazas/plazas.module';
import { AlertsModule } from '../alerts/alerts.module';
import { ReferenceModule } from '../reference/reference.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    SequelizeModule.forFeature([Crossing, CrossingAlert], DB_CONNECTION),
    PlazasModule,
    AlertsModule,
    ReferenceModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
