import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateBy,
  ValidateIf,
  ValidateNested,
  type ValidationOptions,
} from 'class-validator';
import { validatePhone } from '@biasmarket/utils/phone-country';
import { CreateOrderItemDto, ShippingAddressDto } from './create-order.dto.js';

// Same rule and Spanish message as GET /stores/:id/customers/lookup, so the
// form shows one error regardless of which endpoint rejects the number.
function IsValidBuyerPhone(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isValidBuyerPhone',
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && validatePhone(value).ok,
        defaultMessage: (args) => {
          const result =
            typeof args?.value === 'string' ? validatePhone(args.value) : null;
          return result && !result.ok
            ? result.message
            : 'Ingresa un teléfono válido';
        },
      },
    },
    options,
  );
}

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// The seller creates the order on the buyer's behalf, so there is no email,
// proof of payment, or caller-chosen source/owner/expiry: the global
// ValidationPipe (`forbidNonWhitelisted`) rejects any of those with a 400.
export class CreateAssistedOrderDto {
  @IsIn(['PICKUP', 'COURIER'])
  deliveryMethodType: 'PICKUP' | 'COURIER';

  @IsOptional()
  @IsString()
  pickupPointId?: string;

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

  // WhatsApp number of the buyer; stored in canonical E.164.
  @IsString()
  @IsValidBuyerPhone()
  customerPhone: string;

  // Optional alias the seller uses to greet the buyer.
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(60)
  // Control characters, bidi overrides/isolates, zero-width spaces, line and
  // paragraph separators and the BOM would end up in the WhatsApp greeting.
  // ZWJ/ZWNJ stay allowed: emoji sequences and some scripts need them.
  @Matches(/^[^\p{Cc}\u200B\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]*$/u, {
    message: 'El nombre no puede contener caracteres de control o invisibles',
  })
  customerName?: string;

  @ValidateIf((o) => o.deliveryMethodType === 'COURIER')
  @IsDefined()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;

  @IsOptional()
  @IsString()
  courierName?: string;

  @IsOptional()
  @IsIn(['AGENCY', 'HOME'])
  courierModality?: 'AGENCY' | 'HOME';

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
