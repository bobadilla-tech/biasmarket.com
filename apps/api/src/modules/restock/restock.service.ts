import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { CreateRestockRequestDto } from "./dto/create-restock-request.dto.js";

@Injectable()
export class RestockService {
  constructor(private prisma: PrismaService) {}

  async create(slug: string, dto: CreateRestockRequestDto) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException("Tienda no encontrada");

    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (
      !product ||
      product.storeId !== store.id ||
      product.status !== "PUBLISHED" ||
      product.deletedAt !== null
    ) {
      throw new NotFoundException("Producto no encontrado");
    }

    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: dto.variantId },
      });
      if (
        !variant ||
        variant.productId !== product.id ||
        variant.storeId !== store.id
      ) {
        throw new NotFoundException("Variante no encontrada");
      }
    }

    return this.prisma.restockRequest.create({
      data: {
        storeId: store.id,
        productId: product.id,
        variantId: dto.variantId ?? null,
        name: dto.name,
        phone: dto.phone,
      },
      select: { id: true, createdAt: true },
    });
  }

  async listForStore(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException("Store no encontrada");
    if (store.ownerId !== userId) {
      throw new ForbiddenException("No sos dueño de esta store");
    }

    return this.prisma.restockRequest.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        phone: true,
        createdAt: true,
        product: { select: { id: true, name: true, images: true } },
        variant: { select: { id: true, name: true } },
      },
    });
  }
}
