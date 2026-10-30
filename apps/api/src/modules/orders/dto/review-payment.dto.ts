import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class ReviewPaymentDto {
  @IsIn(["approve", "reject"])
  decision: "approve" | "reject";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
