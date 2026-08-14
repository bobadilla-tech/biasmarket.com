import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { WhatsAppMessageType } from '@biasmarket/db';
import { PrismaService } from '../../prisma/prisma.service.js';
import { getMissingRequiredTokens } from '@biasmarket/utils/whatsapp';
import type { UpdateWhatsAppTemplateDto } from './dto/update-whatsapp-template.dto.js';

const WHATSAPP_MESSAGE_TYPES: WhatsAppMessageType[] = [
  'NEW_ORDER',
  'PAYMENT_REMINDER',
];

function parseType(type: string): WhatsAppMessageType {
  if (!WHATSAPP_MESSAGE_TYPES.includes(type as WhatsAppMessageType)) {
    throw new BadRequestException('Tipo de mensaje no válido');
  }
  return type as WhatsAppMessageType;
}

@Injectable()
export class WhatsappTemplatesService {
  constructor(private prisma: PrismaService) {}

  private async assertOwnership(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Store no encontrada');
    if (store.ownerId !== userId) {
      throw new ForbiddenException('No sos dueño de esta store');
    }
    return store;
  }

  // Returns null when the store has no override row for this type — the
  // caller (and the store's sent messages) falls back to the hardcoded
  // default template in that case.
  async findForStore(storeId: string, userId: string, type: string) {
    const messageType = parseType(type);
    await this.assertOwnership(storeId, userId);
    return this.prisma.whatsAppMessageTemplate.findUnique({
      where: { storeId_type: { storeId, type: messageType } },
    });
  }

  async upsert(
    storeId: string,
    userId: string,
    type: string,
    dto: UpdateWhatsAppTemplateDto,
  ) {
    const messageType = parseType(type);
    await this.assertOwnership(storeId, userId);

    const missing = getMissingRequiredTokens(messageType, dto.template);
    if (missing.length > 0) {
      const missingTokens = missing.map((token) => `{{${token}}}`).join(', ');
      throw new BadRequestException(
        `Faltan las variables requeridas: ${missingTokens}`,
      );
    }

    return this.prisma.whatsAppMessageTemplate.upsert({
      where: { storeId_type: { storeId, type: messageType } },
      create: { storeId, type: messageType, template: dto.template },
      update: { template: dto.template },
    });
  }
}
