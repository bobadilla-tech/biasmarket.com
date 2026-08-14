import { Module } from '@nestjs/common';
import { WhatsappTemplatesController } from './whatsapp-templates.controller.js';
import { WhatsappTemplatesService } from './whatsapp-templates.service.js';

@Module({
  controllers: [WhatsappTemplatesController],
  providers: [WhatsappTemplatesService],
  exports: [WhatsappTemplatesService],
})
export class WhatsappTemplatesModule {}
