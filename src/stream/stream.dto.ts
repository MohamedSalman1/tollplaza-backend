import { IsInt, IsOptional, IsTimeZone, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class StreamDto {
  @Type(() => Number)
  @IsInt({ message: 'plaza_id must be a whole number' })
  @Min(1)
  declare plaza_id: number;

  @IsOptional()
  @IsTimeZone({ message: 'tz must be an IANA time zone, e.g. Asia/Kolkata' })
  declare tz?: string;
}
