import { ApiProperty } from '@nestjs/swagger';
import { AccountOrderResponseDto } from './account-order-response.dto.js';

// Money/Decimal, Date-as-ISO-string, and literal-union conventions — see
// collections/dto/collection-response.dto.ts for the full rationale.

// `register`/`login`/`forgotPassword`/`changePassword`/`logout` all return
// this same `{ ok: true }` shape — the session cookie itself is set via
// `@Res({ passthrough: true })`, never part of the JSON body.
//
// adds an optional `sessionToken` field. It is present only on `login` and
// `changePassword` when the request carries `X-Client: mobile`; other flows
// and web/browser callers never receive it. Native mobile clients can't read
// the HttpOnly session cookie, so the controller echoes the same token in
// the JSON body for them.
export class OkResponseDto {
  @ApiProperty({ type: Boolean })
  ok: true;

  @ApiProperty({
    type: String,
    required: false,
    description:
      'Session token, returned only to mobile clients (`X-Client: mobile`) on login and change-password.',
  })
  sessionToken?: string;
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
