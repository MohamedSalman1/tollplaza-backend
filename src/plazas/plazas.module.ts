import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { DB_CONNECTION } from '@app/entities/constants/constants';
import { Plaza } from '@app/entities/models/plaza.entity';
import { UserPlaza } from '@app/entities/models/user-plaza.entity';
import { Lane } from '@app/entities/models/lane.entity';
import { PlazaPricing } from '@app/entities/models/plaza-pricing.entity';
import { IngestModule } from '../ingest/ingest.module';
import { ReferenceModule } from '../reference/reference.module';
import { PlazaAccessService } from './plaza-access.service';
import { PricingService } from './pricing.service';
import { PlazasController } from './plazas.controller';

@Module({
  imports: [
    SequelizeModule.forFeature(
      [Plaza, UserPlaza, Lane, PlazaPricing],
      DB_CONNECTION,
    ),
    // PlazaContextService: price changes clear the ingest cache
    IngestModule,
    ReferenceModule,
  ],
  controllers: [PlazasController],
  providers: [PlazaAccessService, PricingService],
  exports: [PlazaAccessService],
})
export class PlazasModule {}
