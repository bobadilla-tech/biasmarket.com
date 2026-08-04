import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

export class CancelOrderDto {
  @IsIn(["REFUNDED", "RETAINED", "STORE_CREDIT"])
  resolution: "REFUNDED" | "RETAINED" | "STORE_CREDIT";

  @ValidateIf((o) => o.resolution === "RETAINED")
  @IsIn(["FULL", "PARTIAL"])
  retainMode?: "FULL" | "PARTIAL";

  @ValidateIf(
    (o) =>
      o.resolution === "RETAINED" &&
      o.retainMode === "PARTIAL",
  )
  @IsNumber()
  @Min(0)
  retainedAmount?: number;

  @ValidateIf(
    (o) =>
      o.resolution === "RETAINED" &&
      o.retainMode === "PARTIAL",
  )
  @IsIn(["REFUNDED", "STORE_CREDIT"])
  releasedResolution?: "REFUNDED" | "STORE_CREDIT";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
