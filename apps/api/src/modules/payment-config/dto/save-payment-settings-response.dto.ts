import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PaymentMethodConfigResponseDto } from "./payment-method-response.dto.js";

export class SavePaymentSettingsStoreResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  paymentInstructions: string;
}

export class SavePaymentSettingsResponseDto {
  @ApiProperty({ type: [PaymentMethodConfigResponseDto] })
  methods: PaymentMethodConfigResponseDto[];

  @ApiPropertyOptional({ type: SavePaymentSettingsStoreResponseDto })
  store?: SavePaymentSettingsStoreResponseDto;
}
