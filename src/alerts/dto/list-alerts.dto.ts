import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PAGINATION } from '@app/entities/constants/constants';
import { AlertFilterDto } from './alert-filter.dto';

export class ListAlertsDto extends AlertFilterDto {
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
