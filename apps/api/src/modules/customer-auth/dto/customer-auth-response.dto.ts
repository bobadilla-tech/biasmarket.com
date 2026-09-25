import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountOrderResponseDto } from './account-order-response.dto.js';

// Money/Decimal, Date-as-ISO-string, and literal-union conventions — see
// collections/dto/collection-response.dto.ts for the full rationale.

// `register`/`login`/`forgotPassword`/`changePassword`/`logout` all return
// this same `{ ok: true }` shape — the session cookie itself is set via
// `@Res({ passthrough: true })`, never part of the JSON body.
//
// adds an optional `sessionToken` field, present only
// on `login`/`changePassword` when the request carries `X-Client: mobile`.
// Native mobile clients can't read the HttpOnly session cookie, so the
// controller echoes the same token in the JSON body for them. Web/browser
// (and all cookie-mode) callers never see it — the field is null, so the
// response contract (which we regenerate into openapi.json) is unchanged
// for them.
export class OkResponseDto {
  @ApiProperty({ type: Boolean })
  ok: true;

  @ApiPropertyOptional({ type: String, nullable: true })
  sessionToken: string | null;
}

export class CustomerProfileCustomerResponseDto {
  @ApiProperty({ type: String, nullable: true })
  name: string | null;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty()
  phone: string;

  @ApiProperty()
  emailVerified: boolean;

  @ApiProperty({ type: String, nullable: true })
  pendingEmail: string | null;

  @ApiProperty({ type: String, nullable: true })
  pendingPhone: string | null;
}

// `me`'s shape (`CustomerAuthService.getProfile`).
export class CustomerProfileResponseDto {
  @ApiProperty({ type: CustomerProfileCustomerResponseDto })
  customer: CustomerProfileCustomerResponseDto;

  @ApiProperty({ type: [AccountOrderResponseDto] })
  orders: AccountOrderResponseDto[];
}

// `updateMe`'s shape (`CustomerAuthService.updateProfile`).
export class UpdateCustomerProfileResponseDto {
  @ApiProperty({ type: String, nullable: true })
  name: string | null;

  @ApiProperty({ type: String, nullable: true })
  pendingEmail: string | null;

  @ApiProperty({ type: String, nullable: true })
  pendingPhone: string | null;
}
