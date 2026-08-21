import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsDefined,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

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
//
// Peru-specific fields (issue #99): surnames, document type/number,
// department/province/district, and modality-conditional agencyName or
// address lines. Legacy fields (city, region, line1, line2, reference) are
// kept for backward compatibility and filled from the Peru fields by the
// web checkout form.
export class ShippingAddressDto {
  @IsString()
  @MinLength(1)
  recipientName: string;

  @IsOptional()
  @IsString()
  recipientSurnames?: string;

  @IsString()
  @MinLength(6)
  phone: string;

  @IsOptional()
  @IsEnum(['DNI', 'CE', 'RUC', 'PASSPORT'] as const)
  documentType?: 'DNI' | 'CE' | 'RUC' | 'PASSPORT';

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  district?: string;

  // Required for HOME; for AGENCY the web form snapshots agencyName here
  // for display compatibility. Validated per-modality in CreateOrderUseCase.
  @IsOptional()
  @IsString()
  line1?: string;

  @IsOptional()
  @IsString()
  line2?: string;

  // Filled from district by the Peru checkout form. Optional at this layer
  // so AGENCY orders aren't forced to invent a street-level "city".
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  agencyName?: string;
}

export class CreateOrderDto {
  @IsIn(['PICKUP', 'COURIER'])
  deliveryMethodType: 'PICKUP' | 'COURIER';

  @IsOptional()
  @IsString()
  pickupPointId?: string;

  // Date-only, buyer's chosen future pickup date — only required when the
  // selected point isn't open today (see CreateOrderUseCase).
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'pickupDate debe tener el formato YYYY-MM-DD',
  })
  pickupDate?: string;

  @IsOptional()
  @IsIn(['YAPE', 'PLIN', 'TRANSFER', 'CASH'])
  paymentMethod?: 'YAPE' | 'PLIN' | 'TRANSFER' | 'CASH';

  @IsOptional()
  @IsIn(['FULL', 'PARTIAL'])
  paymentType?: 'FULL' | 'PARTIAL';

  @IsString()
  @MinLength(6)
  customerPhone: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  // Required when deliveryMethodType is COURIER (validated in use case),
  // unused for PICKUP — see the plan doc referenced on ShippingAddressDto.
  @ValidateIf((o) => o.deliveryMethodType === 'COURIER')
  @IsDefined()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;

  // Seller-defined courier name, required when deliveryMethodType is COURIER
  // (validated in use case). Snapshot into Order.courierName.
  @IsOptional()
  @IsString()
  courierName?: string;

  // AGENCY or HOME, required when deliveryMethodType is COURIER (validated in
  // use case). Snapshot into Order.courierModality.
  @IsOptional()
  @IsIn(['AGENCY', 'HOME'])
  courierModality?: 'AGENCY' | 'HOME';

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
