import {
  ArrayMinSize,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CrossingFilterDto } from '@app/entities/query/crossing-filter.dto';
import { toList } from '@app/entities/query/transforms';
import {
  CROSSING_FILTER_FIELDS,
  FACETS,
  type CrossingFilterField,
} from '@app/entities/constants/constants';

export class CrossingFacetsDto extends CrossingFilterDto {
  @Transform(toList)
  @ArrayMinSize(1, { message: 'field is required' })
  @IsIn(CROSSING_FILTER_FIELDS, {
    each: true,
    message: `field must be one or more of: ${CROSSING_FILTER_FIELDS.join(', ')}`,
  })
  declare field: CrossingFilterField[];

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(FACETS.max_limit)
  declare limit?: number;
}
