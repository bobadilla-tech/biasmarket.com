import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateCouponDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  plan?: string;

  @IsInt()
  @Min(1)
  @Transform(({ value }) => Number(value))
  durationDays!: number;

  @IsInt()
  @Min(1)
  @Transform(({ value }) => Number(value))
  maxUses!: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === "true")
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class RedeemCouponDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class CouponResponseDto {
  id!: string;
  code!: string;
  name!: string;
  description!: string;
  plan!: string;
  durationDays!: number;
  maxUses!: number;
  isActive!: boolean;
  startsAt!: string | null;
  expiresAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
  redemptionCount!: number;
}

export class CouponRedemptionResponseDto {
  id!: string;
  couponId!: string;
  userId!: string;
  userEmail!: string;
  userName!: string;
  redeemedAt!: string;
  expiresAt!: string;
}
