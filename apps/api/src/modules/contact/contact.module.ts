import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ContactController } from './contact.controller.js';
import { ContactService } from './contact.service.js';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }])],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
