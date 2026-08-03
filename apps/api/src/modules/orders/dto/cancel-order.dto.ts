import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { CancellationResolution } from "@biasmarket/db";

export class CancelOrderDto {
    @IsEnum(CancellationResolution)
    resolution: CancellationResolution;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string;
}