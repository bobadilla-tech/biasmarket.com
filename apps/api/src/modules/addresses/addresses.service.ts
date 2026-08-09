import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { CreateAddressDto } from "./dto/create-address.dto.js";
import type { UpdateAddressDto } from "./dto/update-address.dto.js";

@Injectable()
export class AddressesService {
  constructor(private prisma: PrismaService) {}

  async findAllByCustomer(customerId: string) {
    const addresses = await this.prisma.address.findMany({
      where: { customerId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return addresses.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  async create(customerId: string, dto: CreateAddressDto) {
    return this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.address.count({ where: { customerId } });
      const makeDefault = dto.isDefault || existingCount === 0;

      if (makeDefault) {
        await tx.address.updateMany({
          where: { customerId },
          data: { isDefault: false },
        });
      }

      const created = await tx.address.create({
        data: {
          customerId,
          label: dto.label ?? null,
          recipientName: dto.recipientName,
          phone: dto.phone,
          line1: dto.line1,
          line2: dto.line2 ?? null,
          city: dto.city,
          region: dto.region ?? null,
          reference: dto.reference ?? null,
          isDefault: makeDefault,
        },
      });

      return {
        ...created,
        createdAt: created.createdAt.toISOString(),
      };
    });
  }

  async update(customerId: string, addressId: string, dto: UpdateAddressDto) {
    const address = await this.prisma.address.findUnique({
      where: { id: addressId },
    });
    if (!address || address.customerId !== customerId) {
      throw new NotFoundException("Dirección no encontrada");
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.address.updateMany({
          where: { customerId },
          data: { isDefault: false },
        });
      }

      const updated = await tx.address.update({
        where: { id: addressId },
        data: {
          ...(dto.label !== undefined && { label: dto.label ?? null }),
          ...(dto.recipientName !== undefined && { recipientName: dto.recipientName }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.line1 !== undefined && { line1: dto.line1 }),
          ...(dto.line2 !== undefined && { line2: dto.line2 ?? null }),
          ...(dto.city !== undefined && { city: dto.city }),
          ...(dto.region !== undefined && { region: dto.region ?? null }),
          ...(dto.reference !== undefined && { reference: dto.reference ?? null }),
          ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        },
      });

      return {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
      };
    });
  }

  async delete(customerId: string, addressId: string) {
    const address = await this.prisma.address.findUnique({
      where: { id: addressId },
    });
    if (!address || address.customerId !== customerId) {
      throw new NotFoundException("Dirección no encontrada");
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id: addressId } });

      if (address.isDefault) {
        const remainingFirst = await tx.address.findFirst({
          where: { customerId },
          orderBy: { createdAt: "desc" },
        });
        if (remainingFirst) {
          await tx.address.update({
            where: { id: remainingFirst.id },
            data: { isDefault: true },
          });
        }
      }

      return { success: true };
    });
  }
}
