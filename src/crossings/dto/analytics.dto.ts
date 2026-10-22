import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CrossingFilterDto } from '@app/entities/query/crossing-filter.dto';
import {
  BOOLEAN_STAT_FIELDS,
  HOURLY_GROUPS,
  STATS,
  STAT_FIELDS,
  TIMELINE_BUCKETS,
  type HourlyGroup,
  type StatField,
  type TimelineBucket,
} from '@app/entities/constants/constants';

const BUCKETS = Object.keys(TIMELINE_BUCKETS);
const MATRIX_FIELDS = STAT_FIELDS.filter(
  (field) => !BOOLEAN_STAT_FIELDS.includes(field),
);

export class TimelineDto extends CrossingFilterDto {
  @IsOptional()
  @IsIn(BUCKETS, { message: `bucket must be one of: ${BUCKETS.join(', ')}` })
  declare bucket?: TimelineBucket;
}

export class HourlyDto extends CrossingFilterDto {
  @IsOptional()
  @IsIn(HOURLY_GROUPS, {
    message: `group_by must be one of: ${HOURLY_GROUPS.join(', ')}`,
  })
  declare group_by?: HourlyGroup;
}

export class BreakdownDto extends CrossingFilterDto {
  @IsIn(STAT_FIELDS, {
    message: `field must be one of: ${STAT_FIELDS.join(', ')}`,
  })
  declare field: StatField;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(STATS.breakdown_max_limit)
  declare limit?: number;
}

export class MatrixDto extends CrossingFilterDto {
  @IsIn(MATRIX_FIELDS, {
    message: `rows must be one of: ${MATRIX_FIELDS.join(', ')}`,
  })
  declare rows: StatField;

  @IsIn(MATRIX_FIELDS, {
    message: `cols must be one of: ${MATRIX_FIELDS.join(', ')}`,
  })
  declare cols: StatField;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(STATS.matrix_max)
  declare row_limit?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(STATS.matrix_max)
  declare col_limit?: number;
}
