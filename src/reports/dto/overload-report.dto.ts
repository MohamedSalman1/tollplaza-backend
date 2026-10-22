import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CrossingFilterDto } from '@app/entities/query/crossing-filter.dto';
import { PAGINATION } from '@app/entities/constants/constants';

/**
 * limit/cursor page through the overload log; the totals are always for the
 * whole filtered range.
 */
export class OverloadReportDto extends CrossingFilterDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PAGINATION.max_limit)
  declare limit?: number;

  @IsOptional()
  @IsString()
  declare cursor?: string;
}
