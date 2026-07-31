import { Injectable } from '@nestjs/common';
import { MailerCore, type SendEmailParams } from './mailer.core.js';

@Injectable()
export class MailerService {
  private core = new MailerCore();

  send(params: SendEmailParams): Promise<{ id: string }> {
    return this.core.send(params);
  }
}
