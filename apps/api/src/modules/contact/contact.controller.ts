import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, Public, Roles } from '@thallesp/nestjs-better-auth';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { ContactService } from './contact.service.js';
import { CreateInquiryDto } from './dto/create-inquiry.dto.js';

@Controller('contact')
export class ContactController {
  constructor(private contact: ContactService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post()
  create(@Body() dto: CreateInquiryDto) {
    return this.contact.create(dto);
  }

  @UseGuards(AuthGuard)
  @Roles(['admin'])
  @Get()
  findAll() {
    return this.contact.findAll();
  }

  @UseGuards(AuthGuard)
  @Roles(['admin'])
  @Patch(':id/review')
  markReviewed(@Param('id') id: string) {
    return this.contact.markReviewed(id);
  }
}
