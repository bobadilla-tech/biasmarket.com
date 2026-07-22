import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { vi, type Mock } from 'vitest';
import { ContactService } from './contact.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('ContactService', () => {
  let service: ContactService;
  let prisma: {
    contactInquiry: {
      create: Mock;
      findMany: Mock;
      findUnique: Mock;
      update: Mock;
    };
  };

  const inquiryId = 'inquiry-1';

  beforeEach(async () => {
    prisma = {
      contactInquiry: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ContactService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ContactService>(ContactService);
  });

  it('create() persists the inquiry as-is', async () => {
    const dto = {
      name: 'Jane',
      email: 'jane@example.com',
      message: 'Hi there',
    };
    prisma.contactInquiry.create.mockResolvedValue({ id: inquiryId, ...dto });

    await service.create(dto);

    expect(prisma.contactInquiry.create).toHaveBeenCalledWith({ data: dto });
  });

  it('findAll() lists inquiries newest first', async () => {
    prisma.contactInquiry.findMany.mockResolvedValue([]);

    await service.findAll();

    expect(prisma.contactInquiry.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
  });

  it('markReviewed() throws NotFoundException when the inquiry does not exist', async () => {
    prisma.contactInquiry.findUnique.mockResolvedValue(null);

    await expect(service.markReviewed(inquiryId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('markReviewed() sets status to REVIEWED', async () => {
    prisma.contactInquiry.findUnique.mockResolvedValue({ id: inquiryId });
    prisma.contactInquiry.update.mockResolvedValue({});

    await service.markReviewed(inquiryId);

    expect(prisma.contactInquiry.update).toHaveBeenCalledWith({
      where: { id: inquiryId },
      data: { status: 'REVIEWED' },
    });
  });
});
