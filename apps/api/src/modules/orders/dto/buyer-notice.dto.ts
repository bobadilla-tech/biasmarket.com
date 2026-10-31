import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import { WHATSAPP_BUYER_NOTICE_TYPES } from "@biasmarket/utils/whatsapp";

export class BuyerNoticeDto {
  @ApiProperty({ enum: WHATSAPP_BUYER_NOTICE_TYPES })
  @IsIn(WHATSAPP_BUYER_NOTICE_TYPES)
  notice: (typeof WHATSAPP_BUYER_NOTICE_TYPES)[number];
}
