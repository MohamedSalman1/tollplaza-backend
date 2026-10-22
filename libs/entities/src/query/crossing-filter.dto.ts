import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsTimeZone,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  ALERT_KINDS,
  ALERT_TYPES,
  TIME_RANGES,
  type AlertKind,
  type AlertType,
  type TimeRange,
} from '../constants/constants';
import { toBoolean, toList } from './transforms';

// A number, or "Unknown" for crossings with no value
const NUMBER_OR_UNKNOWN = /^(\d+|unknown)$/i;

/**
 * The filter set shared by the crossings list, stats, analytics, alerts and
 * reports, so every screen agrees with the table. Turned into SQL by
 * buildCrossingWhere().
 */
export class CrossingFilterDto {
  @Type(() => Number)
  @IsInt({ message: 'plaza_id must be a whole number' })
  @Min(1)
  declare plaza_id: number;

  @IsOptional()
  @IsIn(TIME_RANGES, {
    message: `range must be one of: ${TIME_RANGES.join(', ')}`,
  })
  declare range?: TimeRange;

  @IsOptional()
  @IsISO8601({}, { message: 'from must be an ISO 8601 date-time' })
  declare from?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'to must be an ISO 8601 date-time' })
  declare to?: string;

  @IsOptional()
  @IsTimeZone({ message: 'tz must be an IANA time zone, e.g. Asia/Kolkata' })
  declare tz?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  declare q?: string;

  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean({ message: 'ev must be true or false' })
  declare ev?: boolean;

  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean({ message: 'oos must be true or false' })
  declare oos?: boolean;

  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean({ message: 'commercial must be true or false' })
  declare commercial?: boolean;

  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean({ message: 'exempt must be true or false' })
  declare exempt?: boolean;

  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean({ message: 'has_alerts must be true or false' })
  declare has_alerts?: boolean;

  // Which alerts count: hard (default; leaves out description-only
  // DESC_MISMATCH alerts), soft (only those) or all. Applies to has_alerts
  // here, and to the alert lists, summaries and report totals.
  @IsOptional()
  @IsIn(ALERT_KINDS, {
    message: `alert_kind must be one of: ${ALERT_KINDS.join(', ')}`,
  })
  declare alert_kind?: AlertKind;

  // Only crossings with at least one alert of these types
  @Transform(toList)
  @IsOptional()
  @IsIn(ALERT_TYPES, {
    each: true,
    message: `alert_type must be one or more of: ${ALERT_TYPES.join(', ')}`,
  })
  declare alert_type?: AlertType[];

  // Only crossings whose plate is (or isn't) on this plaza's watchlist
  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean({ message: 'watchlist must be true or false' })
  declare watchlist?: boolean;

  @Transform(toList)
  @IsOptional()
  @Matches(NUMBER_OR_UNKNOWN, {
    each: true,
    message: 'lane must be lane numbers or Unknown',
  })
  declare lane?: string[];

  @Transform(toList)
  @IsOptional()
  @MaxLength(64, { each: true })
  declare state?: string[];

  @Transform(toList)
  @IsOptional()
  @MaxLength(128, { each: true })
  declare district?: string[];

  @Transform(toList)
  @IsOptional()
  @MaxLength(32, { each: true })
  declare region?: string[];

  @Transform(toList)
  @IsOptional()
  @MaxLength(64, { each: true })
  declare make?: string[];

  @Transform(toList)
  @IsOptional()
  @MaxLength(64, { each: true })
  declare model?: string[];

  @Transform(toList)
  @IsOptional()
  @MaxLength(32, { each: true })
  declare color?: string[];

  @Transform(toList)
  @IsOptional()
  @Matches(NUMBER_OR_UNKNOWN, {
    each: true,
    message: 'tag_class must be numbers or Unknown',
  })
  declare tag_class?: string[];

  @Transform(toList)
  @IsOptional()
  @Matches(NUMBER_OR_UNKNOWN, {
    each: true,
    message: 'vehicle_class must be numbers or Unknown',
  })
  declare vehicle_class?: string[];

  @Transform(toList)
  @IsOptional()
  @Matches(NUMBER_OR_UNKNOWN, {
    each: true,
    message: 'axles must be numbers or Unknown',
  })
  declare axles?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(32)
  declare plate?: string;
}
