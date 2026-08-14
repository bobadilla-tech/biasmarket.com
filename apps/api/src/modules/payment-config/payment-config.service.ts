import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PaymentMethodType, Prisma } from "@biasmarket/db";
import { PrismaService } from "../../prisma/prisma.service.js";
import { StorageService } from "../../storage/storage.service.js";
import type { UpsertPaymentMethodDto } from "./dto/upsert-payment-method.dto.js";
import type { PaymentMethodDetailsDto } from "./dto/payment-method-details.dto.js";

@Injectable()
export class PaymentConfigService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  private async assertOwnership(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException("Store no encontrada");
    if (store.ownerId !== userId) {
      throw new ForbiddenException("No sos dueño de esta store");
    }
    return store;
  }

  async findAllForStore(storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.paymentMethodConfig.findMany({ where: { storeId } });
  }

  async findEnabledForStore(storeId: string, userId: string) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.paymentMethodConfig.findMany({
      where: { storeId, enabled: true },
    });
  }

  async upsert(storeId: string, userId: string, dto: UpsertPaymentMethodDto) {
    await this.assertOwnership(storeId, userId);
    const details = this.normalizeDetails(dto.method, dto.details);
    return this.prisma.paymentMethodConfig.upsert({
      where: { storeId_method: { storeId, method: dto.method } },
      create: {
        storeId,
        method: dto.method,
        enabled: dto.enabled ?? true,
        details: details as Prisma.InputJsonValue,
      },
      update: {
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.details !== undefined && {
          details: details as Prisma.InputJsonValue,
        }),
      },
    });
  }

  // TRANSFER/YAPE/PLIN each need a different set of required fields — see the
  // plan's "Decision: PaymentMethodConfig.details shape". CASH has no
  // structured details at all, so any submitted details are dropped rather
  // than rejected (the settings UI never shows detail fields for CASH, but a
  // stray payload here shouldn't 400).
  private normalizeDetails(
    method: PaymentMethodType,
    details: PaymentMethodDetailsDto | undefined,
  ): Record<string, unknown> {
    if (!details) return {};
    if (method === "CASH") return {};

    if (method === "TRANSFER") {
      const { bankName, accountNumber, accountHolder, accountType } = details;
      if (!bankName || !accountNumber || !accountHolder) {
        throw new BadRequestException(
          "bankName, accountNumber y accountHolder son requeridos para TRANSFER",
        );
      }
      return {
        bankName,
        accountNumber,
        accountHolder,
        ...(accountType && { accountType }),
      };
    }

    // YAPE | PLIN
    const { phoneNumber, accountHolder, qrImageUrl } = details;
    if (!phoneNumber || !accountHolder) {
      throw new BadRequestException(
        "phoneNumber y accountHolder son requeridos para YAPE/PLIN",
      );
    }
    return {
      phoneNumber,
      accountHolder,
      ...(qrImageUrl && { qrImageUrl }),
    };
  }

  // Reject up front: TRANSFER/CASH have no QR concept, don't let the caller
  // silently accept an upload it has nowhere sensible to store. Deletes the
  // superseded QR object from the bucket on replace so old images don't stay
  // live indefinitely.
  async uploadQrImage(
    storeId: string,
    userId: string,
    method: PaymentMethodType,
    buffer: Buffer,
    mimeType: string,
  ) {
    await this.assertOwnership(storeId, userId);
    if (method !== "YAPE" && method !== "PLIN") {
      throw new BadRequestException("QR solo aplica a YAPE o PLIN");
    }

    const existing = await this.prisma.paymentMethodConfig.findUnique({
      where: { storeId_method: { storeId, method } },
    });
    const previousDetails =
      (existing?.details as Record<string, unknown> | null) ?? {};
    const previousQrUrl = previousDetails.qrImageUrl;

    const url = await this.storage.uploadPaymentQrImage(buffer, mimeType);
    const row = await this.prisma.paymentMethodConfig.upsert({
      where: { storeId_method: { storeId, method } },
      create: {
        storeId,
        method,
        enabled: true,
        details: {
          ...previousDetails,
          qrImageUrl: url,
        } as Prisma.InputJsonValue,
      },
      update: {
        details: {
          ...previousDetails,
          qrImageUrl: url,
        } as Prisma.InputJsonValue,
      },
    });

    if (typeof previousQrUrl === "string" && previousQrUrl) {
      await this.storage.deleteImage(previousQrUrl);
    }

    return row;
  }

  async findEnabledForSlug(slug: string) {
    const store = await this.prisma.store.findUnique({
      where: { slug },
    });

    if (!store) {
      throw new NotFoundException("Store no encontrada");
    }

    return this.prisma.paymentMethodConfig.findMany({
      where: {
        storeId: store.id,
        enabled: true,
      },
    });
  }
}
