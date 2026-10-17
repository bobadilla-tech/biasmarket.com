import { ApiProperty } from "@nestjs/swagger";

export class ReceiptConfirmedResponseDto {
  @ApiProperty({ description: "When the buyer confirmed receiving the order." })
  receiptConfirmedAt: string;
}
