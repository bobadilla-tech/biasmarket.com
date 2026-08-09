import { ApiProperty } from "@nestjs/swagger";

// Date-as-string convention (no Decimal here, but same rationale) — see
// `../../collections/dto/collection-response.dto.ts`.
export class NotificationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  storeId: string;

  @ApiProperty({
    enum: ["LOW_STOCK", "OUT_OF_STOCK", "PAYMENT_PROOF_SUBMITTED"],
  })
  type: "LOW_STOCK" | "OUT_OF_STOCK" | "PAYMENT_PROOF_SUBMITTED";

  @ApiProperty()
  entityType: string;

  @ApiProperty()
  entityId: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ type: "object", additionalProperties: true })
  metadata: Record<string, unknown>;

  @ApiProperty()
  read: boolean;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  readAt: string | null;

  @ApiProperty()
  archived: boolean;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  archivedAt: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt: string;
}

export class NotificationCountResponseDto {
  @ApiProperty()
  count: number;
}
