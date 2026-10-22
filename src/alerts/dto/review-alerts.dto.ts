import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ALERT_REVIEW_MAX_IDS } from '@app/entities/constants/constants';

/**
 * Send alert_ids, crossing_ids (every alert on those crossings, like the
 * dashboard's per-row "mark reviewed"), or both.
 */
export class ReviewAlertsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ALERT_REVIEW_MAX_IDS)
  @IsInt({ each: true, message: 'alert_ids must be whole numbers' })
  @Min(1, { each: true })
  declare alert_ids?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ALERT_REVIEW_MAX_IDS)
  @IsInt({ each: true, message: 'crossing_ids must be whole numbers' })
  @Min(1, { each: true })
  declare crossing_ids?: number[];

  // false re-opens the alerts
  @IsBoolean({ message: 'reviewed must be true or false' })
  declare reviewed: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  declare note?: string;
}
