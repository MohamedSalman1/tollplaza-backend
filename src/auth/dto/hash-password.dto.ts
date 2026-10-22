import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class HashPasswordDto {
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  declare password: string;
}
