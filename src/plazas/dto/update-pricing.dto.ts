import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const MAX_CLASSES = 100;

export class PriceItemDto {
  // Checked against vehicle_classes by the service
  @IsInt({ message: 'vehicle_class must be a whole number' })
  @Min(1)
  declare vehicle_class: number;

  @IsInt({ message: 'price must be whole rupees' })
  @Min(0)
  @Max(100000)
  declare price: number;
}

/**
 * Only the classes sent are changed. Crossings already stored keep the
 * price they were charged at.
 */
export class UpdatePricingDto {
  @IsArray({ message: 'prices must be an array' })
  @ArrayMinSize(1, { message: 'prices must not be empty' })
  @ArrayMaxSize(MAX_CLASSES)
  @ValidateNested({ each: true })
  @Type(() => PriceItemDto)
  declare prices: PriceItemDto[];
}
