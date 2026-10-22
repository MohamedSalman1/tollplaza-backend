import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CrossingFilterDto } from '@app/entities/query/crossing-filter.dto';
import { PAGINATION } from '@app/entities/constants/constants';

export class CrossingUpdatesDto extends CrossingFilterDto {
  // From the previous response's next_cursor. Leave out on the first call to
  // get a starting cursor.
  @IsOptional()
  @IsString()
  declare since?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PAGINATION.max_limit)
  declare limit?: number;
}
