import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class CreateOrderItemDto {
  @IsString()
  productId: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @IsIn(["PICKUP", "COURIER"])
  deliveryMethodType: "PICKUP" | "COURIER";

  @IsOptional()
  @IsString()
  pickupPointId?: string;

  // Date-only, buyer's chosen future pickup date — only required when the
  // selected point isn't open today (see CreateOrderUseCase).
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "pickupDate debe tener el formato YYYY-MM-DD",
  })
  pickupDate?: string;

  @IsOptional()
  @IsIn(["YAPE", "PLIN", "TRANSFER", "CASH"])
  paymentMethod?: "YAPE" | "PLIN" | "TRANSFER" | "CASH";

  @IsString()
  @MinLength(6)
  customerPhone: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
