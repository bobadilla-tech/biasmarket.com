import { Controller, Get, Redirect } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

@Controller()
export class AppController {
  @AllowAnonymous()
  @Get()
  @Redirect()
  root() {
    return { url: process.env.WEB_URL ?? 'http://localhost:3001', statusCode: 302 };
  }
}
