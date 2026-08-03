import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class CancelOrderDto {
  @IsIn(["REFUNDED", "RETAINED", "STORE_CREDIT"])
  resolution: "REFUNDED" | "RETAINED" | "STORE_CREDIT";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
