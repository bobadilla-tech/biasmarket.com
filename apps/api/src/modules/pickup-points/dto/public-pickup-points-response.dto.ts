import { ApiProperty } from "@nestjs/swagger";
import { PickupPointResponseDto } from "./pickup-point-response.dto.js";

// The public pickup-points endpoint returns the enabled points *and* the
// server-computed weekday (0=Sunday..6=Saturday) the server uses for
// openDays validation. Clients must consume `weekday` instead of their own
// local `new Date().getDay()` — if the buyer and the API server are on
// different calendar days, browser-local and server-local weekdays diverge
// and a displayed point can be rejected as unavailable (or an API-valid
// point hidden). One value, served and validated against, keeps the
// storefront and CreateOrderUseCase on the same weekday.
export class PublicPickupPointsResponseDto {
  @ApiProperty({
    description:
      "Server-computed weekday (0=Sunday..6=Saturday) used for openDays validation — storefronts must use this, not their own local date.",
    example: 3,
  })
  weekday: number;

  @ApiProperty({ type: [PickupPointResponseDto] })
  points: PickupPointResponseDto[];
}
