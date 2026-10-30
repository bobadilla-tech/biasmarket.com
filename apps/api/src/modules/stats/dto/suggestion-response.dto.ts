import { ApiProperty } from "@nestjs/swagger";

export class SuggestionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ["info", "warning", "critical"] })
  severity: "info" | "warning" | "critical";

  @ApiProperty()
  titleKey: string;

  @ApiProperty({ type: "object", additionalProperties: true })
  bodyParams: Record<string, string | number>;
}
