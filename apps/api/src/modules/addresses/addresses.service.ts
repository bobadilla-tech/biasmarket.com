import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import {
  hasLiveBuyerIdentity,
  lockBuyerAddresses,
  withBuyerAccountLock,
} from "../customer-auth/buyer-account-lock.js";
import type { CreateAddressDto } from "./dto/create-address.dto.js";
import type { UpdateAddressDto } from "./dto/update-address.dto.js";

@Injectable()
export class AddressesService {
  constructor(private prisma: PrismaService) {}

  async findAllByBuyerAccount(buyerAccountId: string) {
    const addresses = await this.prisma.address.findMany({
      where: { buyerAccountId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return addresses.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  async create(buyerAccountId: string, dto: CreateAddressDto) {
    const result = await withBuyerAccountLock(
      this.prisma,
      buyerAccountId,
      async (tx, account) => {
        if (!hasLiveBuyerIdentity(account))
          throw new NotFoundException("Cuenta no encontrada");
        await lockBuyerAddresses(tx, buyerAccountId);
        const existingCount = await tx.address.count({
          where: { buyerAccountId },
        });
        const makeDefault = dto.isDefault || existingCount === 0;

        if (makeDefault) {
          await tx.address.updateMany({
            where: { buyerAccountId },
            data: { isDefault: false },
          });
        }

        const created = await tx.address.create({
          data: {
            buyerAccountId,
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
      },
    );
    if (!result) throw new NotFoundException("Cuenta no encontrada");
    return result;
  }

  async update(
    buyerAccountId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ) {
    const result = await withBuyerAccountLock(
      this.prisma,
      buyerAccountId,
      async (tx, account) => {
        if (!hasLiveBuyerIdentity(account))
          throw new NotFoundException("Dirección no encontrada");
        await lockBuyerAddresses(tx, buyerAccountId);
        const address = await tx.address.findFirst({
          where: { id: addressId, buyerAccountId },
        });
        if (!address) throw new NotFoundException("Dirección no encontrada");
        if (dto.isDefault === true) {
          await tx.address.updateMany({
            where: { buyerAccountId },
            data: { isDefault: false },
          });
        }

        const updated = await tx.address.updateMany({
          where: { id: addressId, buyerAccountId },
          data: {
            ...(dto.label !== undefined && { label: dto.label ?? null }),
            ...(dto.recipientName !== undefined && {
              recipientName: dto.recipientName,
            }),
            ...(dto.phone !== undefined && { phone: dto.phone }),
            ...(dto.line1 !== undefined && { line1: dto.line1 }),
            ...(dto.line2 !== undefined && { line2: dto.line2 ?? null }),
            ...(dto.city !== undefined && { city: dto.city }),
            ...(dto.region !== undefined && { region: dto.region ?? null }),
            ...(dto.reference !== undefined && {
              reference: dto.reference ?? null,
            }),
            ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
          },
        });
        if (updated.count !== 1)
          throw new NotFoundException("Dirección no encontrada");
        const row = await tx.address.findFirstOrThrow({
          where: { id: addressId, buyerAccountId },
        });

        return {
          ...row,
          createdAt: row.createdAt.toISOString(),
        };
      },
    );
    if (!result) throw new NotFoundException("Dirección no encontrada");
    return result;
  }

  async delete(buyerAccountId: string, addressId: string) {
    const result = await withBuyerAccountLock(
      this.prisma,
      buyerAccountId,
      async (tx, account) => {
        if (!hasLiveBuyerIdentity(account))
          throw new NotFoundException("Dirección no encontrada");
        await lockBuyerAddresses(tx, buyerAccountId);
        const address = await tx.address.findFirst({
          where: { id: addressId, buyerAccountId },
        });
        if (!address) throw new NotFoundException("Dirección no encontrada");
        const deleted = await tx.address.deleteMany({
          where: { id: addressId, buyerAccountId },
        });
        if (deleted.count !== 1)
          throw new NotFoundException("Dirección no encontrada");

        if (address.isDefault) {
          const remainingFirst = await tx.address.findFirst({
            where: { buyerAccountId },
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
      },
    );
    if (!result) throw new NotFoundException("Dirección no encontrada");
    return result;
  }
}
