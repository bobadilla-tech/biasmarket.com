import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VoidOrderPaymentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
