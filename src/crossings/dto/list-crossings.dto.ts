import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CrossingFilterDto } from '@app/entities/query/crossing-filter.dto';
import { toBoolean } from '@app/entities/query/transforms';
import {
  CROSSING_SORTS,
  PAGINATION,
  type CrossingSort,
} from '@app/entities/constants/constants';
import type { SortDirection } from '@app/entities/query/cursor';

export class ListCrossingsDto extends CrossingFilterDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PAGINATION.max_limit)
  declare limit?: number;

  @IsOptional()
  @IsString()
  declare cursor?: string;

  @IsOptional()
  @IsIn(CROSSING_SORTS, {
    message: `sort must be one of: ${CROSSING_SORTS.join(', ')}`,
  })
  declare sort?: CrossingSort;

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'dir must be asc or desc' })
  declare dir?: SortDirection;

  // COUNT(*) is costly on large ranges, so totals are opt-in
  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean({ message: 'include_total must be true or false' })
  declare include_total?: boolean;
}
