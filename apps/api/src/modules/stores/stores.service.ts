import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { slugify } from '@biasmarket/utils/strings';
import { UpdateStoreDto } from './dto/update-store.dto.js';
import { CreateStoreDto } from './dto/create-store.dto.js';

const RESERVED_SLUGS = ['www', 'api', 'admin', 'app'];

@Injectable()
export class StoresService {
  constructor(private prisma: PrismaService) { }

  async create(ownerId: string, dto: CreateStoreDto) {
    const slug = slugify(dto.slug);

    if (RESERVED_SLUGS.includes(slug)) {
      throw new BadRequestException('This slug is reserved');
    }

    const existing = await this.prisma.store.findUnique({ where: { slug } });

    if (existing) {
      throw new BadRequestException('This slug is not avaible');
    }

    return this.prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          name: dto.name,
          slug,
          ownerId,
          themeConfig: {},
          paymentInstructions: '',
          whatsappNumber: dto.whatsappNumber,
          ...(dto.defaultCurrency && { defaultCurrency: dto.defaultCurrency }),
        },
      });
      await tx.deliveryMethodConfig.create({
        data: { storeId: store.id, type: 'PICKUP', enabled: true, details: {} },
      });
      return store;
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.store.findMany({ where: { ownerId: userId } });
  }

  async update(storeId: string, userId: string, dto: UpdateStoreDto) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Store no encontrada');
    if (store.ownerId !== userId) {
      throw new ForbiddenException('No sos dueño de esta store');
    }
    return this.prisma.store.update({ where: { id: storeId }, data: dto });
  }

  async delete(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Store no encontrada');
    if (store.ownerId !== userId) {
      throw new ForbiddenException('No eres dueño de esta store');
    }
    try {
      return await this.prisma.store.delete({ where: { id: storeId } });
    } catch {
      throw new BadRequestException(
        'No se puede eliminar: la tienda tiene productos u órdenes asociadas',
      );
    }
  }

  async findBySlugForOwner(slug: string, userId: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException('Store no encontrada');
    if (store.ownerId !== userId) {
      throw new ForbiddenException('No sos dueño de esta store');
    }
    return store;
  }

  async findAllPublic() {
    return this.prisma.store.findMany({
      select: { slug: true, createdAt: true },
    });
  }

  async findPublicBySlug(slug: string) {
    const store = await this.prisma.store.findUnique({
      where: { slug },
      include: {
        products: {
          where: { status: 'PUBLISHED', deletedAt: null },
          include: { variants: true },
        },
      },
    });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    return store;
  }

  async updateLogo(storeId: string, userId: string, url: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Store no encontrada');
    if (store.ownerId !== userId) {
      throw new ForbiddenException('No eres dueño de esta store');
    }
    return this.prisma.store.update({ where: { id: storeId }, data: { logoUrl: url } });
  }
}
