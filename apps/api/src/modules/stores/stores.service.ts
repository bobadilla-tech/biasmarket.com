import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { slugify } from '@barristore/utils';

const RESERVED_SLUGS = ['www', 'api', 'admin', 'app'];

@Injectable()
export class StoresService {
  constructor(private prisma: PrismaService) {}

  async create(ownerId: string, name: string, rawSlug: string) {
    const slug = slugify(rawSlug);
    if (RESERVED_SLUGS.includes(slug)) {
      throw new BadRequestException('This slug is reserved');
    }
    const existing = await this.prisma.store.findUnique({ where: { slug } });
    if (existing) {
      throw new BadRequestException('This slug is not avaible');
    }
    return this.prisma.store.create({
      data: { name, slug, ownerId, themeConfig: {}, paymentInstructions: '' },
    });
  }
}
