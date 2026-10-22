import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { DB_CONNECTION } from '@app/entities/constants/constants';
import { Crossing } from '@app/entities/models/crossing.entity';
import { LaneCamera } from '@app/entities/models/lane-camera.entity';
import { PlazasModule } from '../plazas/plazas.module';
import { LanesController } from './lanes.controller';
import { LanesService } from './lanes.service';

@Module({
  imports: [
    SequelizeModule.forFeature([Crossing, LaneCamera], DB_CONNECTION),
    PlazasModule,
  ],
  controllers: [LanesController],
  providers: [LanesService],
  exports: [LanesService],
})
export class LanesModule {}
