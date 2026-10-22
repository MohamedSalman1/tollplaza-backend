import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { INGEST } from '@app/entities/constants/constants';

// The feed sends numbers as strings ("4") and sometimes empty strings.
const toOptionalInt = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const n = Number(value);
  return Number.isNaN(n) ? value : n;
};

// is_exempt is "1" for exempt; anything else is not exempt.
const toExemptFlag = ({ value }: { value: unknown }) =>
  value === true ||
  value === 1 ||
  (typeof value === 'string' && value.trim() === '1');

/**
 * One crossing, using the same field names as the existing crossing feed so
 * the camera service doesn't need to rename anything.
 */
export class IngestCrossingItemDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'number' ? String(value) : value,
  )
  @IsString({ message: 'id must be a string or number' })
  @IsNotEmpty({ message: 'id is required' })
  @MaxLength(64)
  declare id: string;

  @IsString({ message: 'timestamp must be an ISO 8601 string' })
  @IsNotEmpty({ message: 'timestamp is required' })
  declare timestamp: string;

  @IsOptional()
  @IsString()
  declare camera_name?: string | null;

  @IsOptional()
  @IsString()
  declare license_plate?: string | null;

  @IsOptional()
  @IsString()
  declare plate_bg_color?: string | null;

  @IsOptional()
  @IsString()
  declare plate_text_color?: string | null;

  @IsOptional()
  @IsString()
  declare state_name?: string | null;

  @IsOptional()
  @IsString()
  declare state_code?: string | null;

  @IsOptional()
  @IsString()
  declare rto_code?: string | null;

  @IsOptional()
  @IsString()
  declare district?: string | null;

  @IsOptional()
  @IsString()
  declare location?: string | null;

  @IsOptional()
  @IsString()
  declare region?: string | null;

  @IsOptional()
  @IsString()
  declare vehicle_make?: string | null;

  @IsOptional()
  @IsString()
  declare vehicle_model?: string | null;

  @IsOptional()
  @IsString()
  declare vehicle_color?: string | null;

  @Transform(toOptionalInt)
  @IsOptional()
  @IsInt({ message: 'vehicle_class must be a whole number' })
  @Min(0)
  @Max(99)
  declare vehicle_class?: number;

  @Transform(toOptionalInt)
  @IsOptional()
  @IsInt({ message: 'tag_class must be a whole number' })
  @Min(0)
  @Max(99)
  declare tag_class?: number;

  @Transform(toOptionalInt)
  @IsOptional()
  @IsInt({ message: 'axles must be a whole number' })
  @Min(0)
  @Max(99)
  declare axles?: number;

  @IsOptional()
  @IsString()
  declare description?: string | null;

  @Transform(toExemptFlag)
  @IsOptional()
  @IsBoolean()
  declare is_exempt?: boolean;

  @IsOptional()
  @IsString()
  declare exempt_vehicle_class?: string | null;

  @IsOptional()
  @IsString()
  declare image_url?: string | null;

  @IsOptional()
  @IsString()
  declare video_url?: string | null;

  // Stored as sent; no rule uses them yet
  @IsOptional()
  @IsString()
  declare government_class?: string | null;

  @IsOptional()
  @IsString()
  declare special_class?: string | null;

  @IsOptional()
  @IsString()
  declare clean?: string | null;

  @IsOptional()
  @IsString()
  declare clean2?: string | null;

  @IsOptional()
  @IsString()
  declare clean3?: string | null;
}

export class IngestCrossingsDto {
  @IsString({ message: 'plaza_code must be a string' })
  @IsNotEmpty({ message: 'plaza_code is required' })
  declare plaza_code: string;

  @IsArray({ message: 'crossings must be an array' })
  @ArrayMinSize(1, { message: 'crossings must not be empty' })
  @ArrayMaxSize(INGEST.max_batch, {
    message: `crossings can hold at most ${INGEST.max_batch} records`,
  })
  @ValidateNested({ each: true })
  @Type(() => IngestCrossingItemDto)
  declare crossings: IngestCrossingItemDto[];
}
