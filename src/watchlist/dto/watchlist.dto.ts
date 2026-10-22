import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  WATCHLIST_CATEGORIES,
  type WatchlistCategory,
} from '@app/entities/models/watchlist-entry.entity';

const CATEGORY_MESSAGE = `category must be one of: ${WATCHLIST_CATEGORIES.join(', ')}`;

export class ListWatchlistDto {
  @Type(() => Number)
  @IsInt({ message: 'plaza_id must be a whole number' })
  @Min(1)
  declare plaza_id: number;

  @IsOptional()
  @IsIn(WATCHLIST_CATEGORIES, { message: CATEGORY_MESSAGE })
  declare category?: WatchlistCategory;

  // Matches anywhere in the plate (spaces ignored)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  declare q?: string;
}

export class CreateWatchlistDto {
  // null or left out = every plaza (admin only)
  @IsOptional()
  @IsInt({ message: 'plaza_id must be a whole number or null' })
  @Min(1)
  declare plaza_id?: number | null;

  @IsString()
  @IsNotEmpty({ message: 'plate is required' })
  @MaxLength(32)
  declare plate: string;

  @IsIn(WATCHLIST_CATEGORIES, { message: CATEGORY_MESSAGE })
  declare category: WatchlistCategory;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  declare note?: string | null;
}

export class UpdateWatchlistDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  declare plate?: string;

  @IsOptional()
  @IsIn(WATCHLIST_CATEGORIES, { message: CATEGORY_MESSAGE })
  declare category?: WatchlistCategory;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  declare note?: string | null;
}
