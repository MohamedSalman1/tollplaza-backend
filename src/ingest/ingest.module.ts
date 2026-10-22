import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { DB_CONNECTION } from '@app/entities/constants/constants';
import { Plaza } from '@app/entities/models/plaza.entity';
import { PlazaPricing } from '@app/entities/models/plaza-pricing.entity';
import { Lane } from '@app/entities/models/lane.entity';
import { LaneCamera } from '@app/entities/models/lane-camera.entity';
import { Crossing } from '@app/entities/models/crossing.entity';
import { CrossingAlert } from '@app/entities/models/crossing-alert.entity';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { PlazaContextService } from './plaza-context.service';
import { ReferenceModule } from '../reference/reference.module';

@Module({
  imports: [
    SequelizeModule.forFeature(
      [Plaza, PlazaPricing, Lane, LaneCamera, Crossing, CrossingAlert],
      DB_CONNECTION,
    ),
    ReferenceModule,
  ],
  controllers: [IngestController],
  providers: [IngestService, PlazaContextService],
  exports: [PlazaContextService],
})
export class IngestModule {}
