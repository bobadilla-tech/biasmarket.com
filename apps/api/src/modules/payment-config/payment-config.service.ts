import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type PaymentMethodType } from "@biasmarket/db";
import { PrismaService } from "../../prisma/prisma.service.js";
import { StorageService } from "../../storage/storage.service.js";
import type { UpsertPaymentMethodDto } from "./dto/upsert-payment-method.dto.js";
import type { PaymentMethodDetailsDto } from "./dto/payment-method-details.dto.js";
import type { SavePaymentSettingsDto } from "./dto/save-payment-settings.dto.js";
import { isDeepStrictEqual } from "node:util";

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
      throw new ForbiddenException("No eres propietario de esta tienda");
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

  async saveSettings(
    storeId: string,
    userId: string,
    dto: SavePaymentSettingsDto,
  ) {
    await this.assertOwnership(storeId, userId);
    if (
      new Set(dto.methods.map((change) => change.method)).size !==
      dto.methods.length
    ) {
      throw new BadRequestException("No puedes repetir un método de pago");
    }
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const [store, existingRows] = await Promise.all([
            tx.store.findUnique({ where: { id: storeId } }),
            tx.paymentMethodConfig.findMany({ where: { storeId } }),
          ]);
          if (!store) throw new NotFoundException("Store no encontrada");

          for (const change of dto.methods) {
            const existing = existingRows.find(
              (row) => row.method === change.method,
            );
            if (
              change.expectedEnabled !== undefined &&
              (existing?.enabled ?? true) !== change.expectedEnabled
            )
              throw new ConflictException(
                "La configuración de pagos cambió. Recarga antes de guardar.",
              );
            if (
              change.expectedDepositPercent !== undefined &&
              (existing?.depositPercent ?? 100) !==
                change.expectedDepositPercent
            )
              throw new ConflictException(
                "La configuración de pagos cambió. Recarga antes de guardar.",
              );
            if (
              change.expectedDetails !== undefined &&
              !isDeepStrictEqual(
                existing?.details ?? {},
                change.expectedDetails,
              )
            )
              throw new ConflictException(
                "La configuración de pagos cambió. Recarga antes de guardar.",
              );
          }
          if (
            dto.expectedPaymentInstructions !== undefined &&
            store.paymentInstructions !== dto.expectedPaymentInstructions
          )
            throw new ConflictException(
              "Las instrucciones de pago cambiaron. Recarga antes de guardar.",
            );

          const updatedMethods: Awaited<
            ReturnType<typeof tx.paymentMethodConfig.findMany>
          > = [];
          for (const change of dto.methods) {
            const details = change.details
              ? this.normalizeDetails(
                  change.method,
                  change.details as PaymentMethodDetailsDto,
                )
              : undefined;
            updatedMethods.push(
              await tx.paymentMethodConfig.upsert({
                where: { storeId_method: { storeId, method: change.method } },
                create: {
                  storeId,
                  method: change.method,
                  enabled: change.enabled ?? true,
                  details: (details ?? {}) as Prisma.InputJsonValue,
                  ...(change.depositPercent !== undefined && {
                    depositPercent: change.depositPercent,
                  }),
                },
                update: {
                  ...(change.enabled !== undefined && {
                    enabled: change.enabled,
                  }),
                  ...(details !== undefined && {
                    details: details as Prisma.InputJsonValue,
                  }),
                  ...(change.depositPercent !== undefined && {
                    depositPercent: change.depositPercent,
                  }),
                },
              }),
            );
          }
          const updatedStore =
            dto.paymentInstructions === undefined
              ? undefined
              : await tx.store.update({
                  where: { id: storeId },
                  data: { paymentInstructions: dto.paymentInstructions },
                });
          return {
            methods: updatedMethods,
            ...(updatedStore && {
              store: {
                id: updatedStore.id,
                paymentInstructions: updatedStore.paymentInstructions,
              },
            }),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        throw new ConflictException(
          "La configuración de pagos cambió. Recarga antes de guardar.",
        );
      }
      throw error;
    }
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
        ...(dto.depositPercent !== undefined && {
          depositPercent: dto.depositPercent,
        }),
      },
      update: {
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.details !== undefined && {
          details: details as Prisma.InputJsonValue,
        }),
        ...(dto.depositPercent !== undefined && {
          depositPercent: dto.depositPercent,
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
    const mergedDetails = {
      phoneNumber: "",
      accountHolder: "",
      ...previousDetails,
      qrImageUrl: url,
    };
    const row = await this.prisma.paymentMethodConfig.upsert({
      where: { storeId_method: { storeId, method } },
      create: {
        storeId,
        method,
        enabled: true,
        details: mergedDetails as Prisma.InputJsonValue,
      },
      update: {
        details: mergedDetails as Prisma.InputJsonValue,
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
