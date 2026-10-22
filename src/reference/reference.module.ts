import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { DB_CONNECTION } from '@app/entities/constants/constants';
import { TagClass } from '@app/entities/models/tag-class.entity';
import { VehicleClass } from '@app/entities/models/vehicle-class.entity';
import { ReferenceController } from './reference.controller';
import { ReferenceService } from './reference.service';

@Module({
  imports: [
    SequelizeModule.forFeature([TagClass, VehicleClass], DB_CONNECTION),
  ],
  controllers: [ReferenceController],
  providers: [ReferenceService],
  exports: [ReferenceService],
})
export class ReferenceModule {}
