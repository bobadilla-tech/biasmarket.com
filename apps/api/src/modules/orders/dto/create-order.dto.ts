import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsDefined,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateIf,
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

// Snapshotted verbatim into Order.deliveryDetails at order-creation time —
// never read back server-side afterwards. Guests and logged-in buyers submit
// the same inline shape; there is no addressId picker. See
// docs/plans/2026-08-08-buyer-shipping-addresses-plan.md's "Important
// correction" section for why a saved-address FK reference was dropped from
// this DTO.
export class ShippingAddressDto {
  @IsString()
  @MinLength(1)
  recipientName: string;

  @IsString()
  @MinLength(6)
  phone: string;

  @IsString()
  @MinLength(1)
  line1: string;

  @IsOptional()
  @IsString()
  line2?: string;

  @IsString()
  @MinLength(1)
  city: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  reference?: string;
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

  // Required when deliveryMethodType is COURIER (validated below), unused
  // for PICKUP — see the plan doc referenced on ShippingAddressDto.
  @ValidateIf((o) => o.deliveryMethodType === "COURIER")
  @IsDefined()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
