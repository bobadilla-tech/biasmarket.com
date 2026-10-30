import { IsString, Matches, MaxLength } from 'class-validator';
import { IsValidBuyerPhone } from './is-valid-buyer-phone.js';

// Supplied only to the internal, secret-guarded request-processing endpoint.
// Do not log, persist, or echo customerPhone.
export class AssistedOrderIdentityErasureDto {
  @IsString()
  @MaxLength(64)
  storeId: string;

  @IsString()
  @MaxLength(32)
  @IsValidBuyerPhone()
  customerPhone: string;

  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9._-]+$/)
  operatorId: string;

  @IsString()
  @MaxLength(120)
  @Matches(/^[A-Za-z0-9._/#-]+$/)
  requestReference: string;
}
