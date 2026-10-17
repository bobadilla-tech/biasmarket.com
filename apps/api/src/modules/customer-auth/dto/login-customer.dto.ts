import { IsString, MinLength } from "class-validator";

export class LoginCustomerDto {
  @IsString()
  @MinLength(1)
  phone: string;

  @IsString()
  @MinLength(1)
  password: string;
}
