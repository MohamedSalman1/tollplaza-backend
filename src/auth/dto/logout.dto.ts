import { IsBoolean, IsOptional } from 'class-validator';

export class LogoutDto {
  // true = end every session of this user, not just this one
  @IsOptional()
  @IsBoolean({ message: 'all must be true or false' })
  declare all?: boolean;
}
