import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";

export class ReclaimTicketDto {
  @ApiProperty({
    description: "Short-lived, signed reclaim ticket from the email link.",
    maxLength: 4096,
  })
  @IsString()
  @MaxLength(4096)
  ticket!: string;
}
