import { IsOptional, IsTimeZone } from 'class-validator';

export class CrossingDetailDto {
  @IsOptional()
  @IsTimeZone({ message: 'tz must be an IANA time zone, e.g. Asia/Kolkata' })
  declare tz?: string;
}
