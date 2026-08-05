import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, Public, Roles } from "@thallesp/nestjs-better-auth";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { ContactService } from "./contact.service.js";
import { CreateInquiryDto } from "./dto/create-inquiry.dto.js";
import { InquiryResponseDto } from "./dto/inquiry-response.dto.js";

interface InquiryRow {
  id: string;
  name: string;
  email: string;
  company: string | null;
  inquiryType: string | null;
  message: string;
  status: "NEW" | "REVIEWED" | "ARCHIVED";
  createdAt: Date;
}

function toInquiryDto(inquiry: InquiryRow): InquiryResponseDto {
  return { ...inquiry, createdAt: inquiry.createdAt.toISOString() };
}

@Controller("contact")
export class ContactController {
  constructor(private contact: ContactService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post()
  async create(@Body() dto: CreateInquiryDto): Promise<InquiryResponseDto> {
    const inquiry = await this.contact.create(dto);
    return toInquiryDto(inquiry);
  }

  @UseGuards(AuthGuard)
  @Roles(["admin"])
  @Get()
  async findAll(): Promise<InquiryResponseDto[]> {
    const inquiries = await this.contact.findAll();
    return inquiries.map(toInquiryDto);
  }

  @UseGuards(AuthGuard)
  @Roles(["admin"])
  @Patch(":id/review")
  async markReviewed(
    @Param("id") id: string,
  ): Promise<InquiryResponseDto> {
    const inquiry = await this.contact.markReviewed(id);
    return toInquiryDto(inquiry);
  }
}
