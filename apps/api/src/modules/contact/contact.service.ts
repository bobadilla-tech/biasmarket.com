import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateInquiryDto } from './dto/create-inquiry.dto.js';

@Injectable()
export class ContactService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreateInquiryDto) {
    return this.prisma.contactInquiry.create({ data: dto });
  }

  findAll() {
    return this.prisma.contactInquiry.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async markReviewed(id: string) {
    const inquiry = await this.prisma.contactInquiry.findUnique({
      where: { id },
    });
    if (!inquiry) throw new NotFoundException('Inquiry not found');

    return this.prisma.contactInquiry.update({
      where: { id },
      data: { status: 'REVIEWED' },
    });
  }
}
