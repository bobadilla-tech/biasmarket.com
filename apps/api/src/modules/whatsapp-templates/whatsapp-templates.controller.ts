import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
} from "@nestjs/common";
import { ApiOkResponse, ApiParam, getSchemaPath } from "@nestjs/swagger";
import { AuthGuard, Session } from "@thallesp/nestjs-better-auth";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { WhatsappTemplatesService } from "./whatsapp-templates.service.js";
import { UpdateWhatsAppTemplateDto } from "./dto/update-whatsapp-template.dto.js";
import { WhatsAppTemplateResponseDto } from "./dto/whatsapp-template-response.dto.js";

const WHATSAPP_MESSAGE_TYPE_PARAM = { name: "type", type: String, enum: ["NEW_ORDER", "PAYMENT_REMINDER"] };

interface WhatsAppTemplateRow {
  id: string;
  storeId: string;
  type: "NEW_ORDER" | "PAYMENT_REMINDER";
  template: string;
  updatedAt: Date;
}

function toWhatsAppTemplateDto(
  row: WhatsAppTemplateRow,
): WhatsAppTemplateResponseDto {
  return { ...row, updatedAt: row.updatedAt.toISOString() };
}

@Controller("stores/:storeId/whatsapp-templates")
@UseGuards(AuthGuard)
export class WhatsappTemplatesController {
  constructor(private whatsappTemplates: WhatsappTemplatesService) {}

  // Returns null (200) when the store has no override for this type — the
  // frontend shows the hardcoded default template in that case. A plain
  // `Promise<WhatsAppTemplateResponseDto | null>` return type makes
  // @nestjs/swagger emit an anonymous `{ type: "object" }` (no $ref), so the
  // nullable response is documented explicitly.
  @ApiOkResponse({
    schema: {
      allOf: [{ $ref: getSchemaPath(WhatsAppTemplateResponseDto) }],
      nullable: true,
    },
  })
  @ApiParam(WHATSAPP_MESSAGE_TYPE_PARAM)
  @Get(":type")
  async findOne(
    @Param("storeId") storeId: string,
    @Param("type") type: string,
    @Session() session: UserSession,
  ): Promise<WhatsAppTemplateResponseDto | null> {
    const row = await this.whatsappTemplates.findForStore(
      storeId,
      session.user.id,
      type,
    );
    return row ? toWhatsAppTemplateDto(row) : null;
  }

  @ApiParam(WHATSAPP_MESSAGE_TYPE_PARAM)
  @Put(":type")
  async upsert(
    @Param("storeId") storeId: string,
    @Param("type") type: string,
    @Session() session: UserSession,
    @Body() dto: UpdateWhatsAppTemplateDto,
  ): Promise<WhatsAppTemplateResponseDto> {
    const row = await this.whatsappTemplates.upsert(
      storeId,
      session.user.id,
      type,
      dto,
    );
    return toWhatsAppTemplateDto(row);
  }
}
