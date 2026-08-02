import { IsString, MinLength } from 'class-validator';

export class ChangeCustomerPasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
