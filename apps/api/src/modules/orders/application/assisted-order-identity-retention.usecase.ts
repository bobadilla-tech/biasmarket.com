import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { normalizePhone, validatePhone } from "@biasmarket/utils/phone-country";
import type { Prisma } from "@biasmarket/db";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { StorageService } from "../../../storage/storage.service.js";
import { lockAssistedCustomer } from "./assisted-customer.js";

export const ASSISTED_ORDER_IDENTITY_RETENTION_DAYS = 90;
const RETENTION_BATCH_SIZE = 500;

type ErasureCause = "BUYER_REQUEST" | "RETENTION";
type RequestAuditContext = { operatorId: string; requestReference: string };

@Injectable()
export class AssistedOrderIdentityRetentionUseCase {
  private readonly logger = new Logger(
    AssistedOrderIdentityRetentionUseCase.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // Called by an authorized support operator after verifying the buyer's
  // request out-of-band. The phone is only used to find records and is never
  // copied into an audit row or log. Active orders are returned as deferred;
  // run the same operation again after they close.
  async eraseOnBuyerRequest(
    storeId: string,
    rawPhone: string,
    operatorId: string,
    requestReference: string,
  ) {
    const phone = validatePhone(rawPhone);
    if (!phone.ok) throw new BadRequestException(phone.message);

    const candidates = await this.prisma.order.findMany({
      where: {
        storeId,
        source: "VENDOR_ASSISTED",
        buyerIdentityErasedAt: null,
        OR: [
          { customerPhoneNormalized: phone.phone },
          { customerPhoneNormalized: null },
        ],
      },
      select: {
        id: true,
        storeId: true,
        customerId: true,
        customerPhone: true,
        customerPhoneNormalized: true,
        buyerAccountId: true,
        claimedAt: true,
        status: true,
        fulfillmentStatus: true,
        accessTokenRevokedAt: true,
      },
    });

    let anonymized = 0;
    let deferred = 0;
    for (const order of candidates) {
      // Rows from the pre-normalization blue/green window can still have a
      // null indexed phone. Normalize those locally, within this store only.
      if (
        order.customerPhoneNormalized !== phone.phone &&
        normalizePhone(order.customerPhone) !== phone.phone
      ) {
        continue;
      }
      if (!isClosed(order.status, order.fulfillmentStatus)) {
        deferred++;
        continue;
      }
      if (
        await this.eraseOrder(order, "BUYER_REQUEST", undefined, {
          operatorId,
          requestReference,
        })
      ) {
        anonymized++;
      }
    }

    await this.processPendingMediaDeletions();

    // Keep the store contact available while any matched order is still active.
    // Its Customer row is shared by all order types for this store and phone.
    if (deferred > 0) return { anonymized, deferred };

    // Remove an orphaned store contact too (for example, a seller entered a
    // number but never created an order). The exact store+phone key prevents
    // one store's request from changing another store's contact.
    const contact = await this.prisma.customer.findUnique({
      where: { storeId_phone: { storeId, phone: phone.phone } },
      select: { id: true },
    });
    if (contact) {
      await this.prisma.$transaction(async (tx) => {
        const customerBefore = await tx.customer.findUnique({
          where: { id: contact.id },
          select: {
            id: true,
            storeId: true,
            phone: true,
            identityErasedAt: true,
          },
        });
        if (
          !customerBefore ||
          customerBefore.storeId !== storeId ||
          customerBefore.phone !== phone.phone ||
          customerBefore.identityErasedAt
        ) {
          return;
        }

        await lockAssistedCustomer(tx, storeId, customerBefore.phone);
        const customerAfter = await tx.customer.findUnique({
          where: { id: customerBefore.id },
          select: {
            id: true,
            storeId: true,
            phone: true,
            identityErasedAt: true,
          },
        });
        if (
          !customerAfter ||
          customerAfter.storeId !== storeId ||
          customerAfter.phone !== customerBefore.phone ||
          customerAfter.identityErasedAt ||
          (await hasRemainingCustomerOrders(tx, customerAfter))
        ) {
          return;
        }

        const changed = await tx.customer.updateMany({
          where: {
            id: contact.id,
            storeId,
            identityErasedAt: null,
          },
          data: erasedCustomerData(contact.id),
        });
        if (changed.count > 0) {
          await tx.auditLog.create({
            data: {
              actorId: operatorId,
              storeId,
              action: "customer.assisted_identity_erased",
              entityType: "Customer",
              entityId: contact.id,
              metadata: {
                cause: "BUYER_REQUEST",
                requestReference,
                fields: ["phone", "name", "email", "credentials"],
              },
            },
          });
        }
      });
    }

    return { anonymized, deferred };
  }

  // Daily idempotent cleanup. An order must be a terminal, unclaimed assisted
  // order and have been closed for at least 90 days. Claimed orders are only
  // handled when an authorized buyer request names them.
  async eraseExpiredUnclaimedIdentities(now = new Date()) {
    const cutoff = new Date(now);
    cutoff.setUTCDate(
      cutoff.getUTCDate() - ASSISTED_ORDER_IDENTITY_RETENTION_DAYS,
    );
    const candidates = await this.prisma.order.findMany({
      where: {
        source: "VENDOR_ASSISTED",
        claimedAt: null,
        buyerAccountId: null,
        buyerIdentityErasedAt: null,
        closedAt: { lte: cutoff },
        OR: [{ status: "CANCELLED" }, { fulfillmentStatus: "COMPLETED" }],
      },
      orderBy: [{ closedAt: "asc" }, { id: "asc" }],
      take: RETENTION_BATCH_SIZE,
      select: {
        id: true,
        storeId: true,
        customerId: true,
        customerPhone: true,
        customerPhoneNormalized: true,
        buyerAccountId: true,
        claimedAt: true,
        status: true,
        fulfillmentStatus: true,
        accessTokenRevokedAt: true,
      },
    });

    let anonymized = 0;
    for (const order of candidates) {
      try {
        if (await this.eraseOrder(order, "RETENTION", cutoff)) anonymized++;
      } catch {
        // Record only the stable order ID; database errors can include query values.
        this.logger.error(
          `Assisted-order identity cleanup failed; orderId=${order.id}`,
        );
      }
    }
    await this.processPendingMediaDeletions();
    return { anonymized };
  }

  private async processPendingMediaDeletions() {
    const pending = await this.prisma.assistedOrderMediaDeletion.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: RETENTION_BATCH_SIZE,
      select: { id: true, url: true },
    });
    for (const item of pending) {
      try {
        await this.storage.deleteImage(item.url);
        await this.prisma.assistedOrderMediaDeletion.deleteMany({
          where: { id: item.id },
        });
      } catch {
        // Keep the retry row. Neither the storage URL nor provider error is
        // copied into logs; the next scheduled sweep retries this object.
        this.logger.error(
          `Assisted-order media deletion failed; deletionId=${item.id}`,
        );
      }
    }
  }

  private async eraseOrder(
    order: {
      id: string;
      storeId: string;
      customerId: string | null;
      customerPhone?: string;
      customerPhoneNormalized?: string | null;
      buyerAccountId: string | null;
      claimedAt: Date | null;
      status: string;
      fulfillmentStatus: string;
      accessTokenRevokedAt: Date | null;
    },
    cause: ErasureCause,
    retentionCutoff?: Date,
    requestAudit?: RequestAuditContext,
  ): Promise<boolean> {
    const erasedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const payments = await tx.orderPayment.findMany({
        where: { orderId: order.id },
        select: { imageUrl: true },
      });
      const mediaUrls = [
        ...payments.flatMap((payment) =>
          payment.imageUrl ? [payment.imageUrl] : [],
        ),
      ];
      const currentOrder = await tx.order.findUnique({
        where: { id: order.id },
        select: { packedPhotoUrl: true },
      });
      if (currentOrder?.packedPhotoUrl)
        mediaUrls.push(currentOrder.packedPhotoUrl);
      const orderPhone =
        order.customerPhoneNormalized ??
        (order.customerPhone?.trim()
          ? normalizePhone(order.customerPhone)
          : null);
      const customerBefore = order.customerId
        ? await tx.customer.findUnique({
            where: { id: order.customerId },
            select: {
              id: true,
              storeId: true,
              phone: true,
              identityErasedAt: true,
            },
          })
        : orderPhone
          ? await tx.customer.findUnique({
              where: {
                storeId_phone: { storeId: order.storeId, phone: orderPhone },
              },
              select: {
                id: true,
                storeId: true,
                phone: true,
                identityErasedAt: true,
              },
            })
          : null;
      let customerForErasure: typeof customerBefore = null;
      if (
        customerBefore &&
        customerBefore.storeId === order.storeId &&
        !customerBefore.identityErasedAt
      ) {
        await lockAssistedCustomer(tx, order.storeId, customerBefore.phone);
        const customerAfter = await tx.customer.findUnique({
          where: { id: customerBefore.id },
          select: {
            id: true,
            storeId: true,
            phone: true,
            identityErasedAt: true,
          },
        });
        if (
          customerAfter &&
          customerAfter.storeId === order.storeId &&
          customerAfter.phone === customerBefore.phone &&
          !customerAfter.identityErasedAt
        ) {
          customerForErasure = customerAfter;
        }
      }

      const changed = await tx.order.updateMany({
        where: {
          id: order.id,
          storeId: order.storeId,
          source: "VENDOR_ASSISTED",
          buyerIdentityErasedAt: null,
          buyerAccountId: order.buyerAccountId,
          claimedAt: order.claimedAt,
          status: order.status as "ACTIVE" | "CANCELLED",
          fulfillmentStatus: order.fulfillmentStatus as
            "ORDERING" | "IN_TRANSIT" | "READY" | "COMPLETED",
          ...(cause === "RETENTION"
            ? {
                claimedAt: null,
                buyerAccountId: null,
                closedAt: { lte: retentionCutoff },
              }
            : {}),
        },
        data: {
          customerPhone: "",
          customerPhoneNormalized: null,
          customerName: null,
          customerEmail: null,
          deliveryDetails: {},
          buyerAccountId: null,
          accessTokenHash: null,
          trackingNumber: null,
          trackingUrl: null,
          packedPhotoUrl: null,
          paymentRejectionReason: null,
          cancellationReason: null,
          accessTokenRevokedAt: order.accessTokenRevokedAt ?? erasedAt,
          buyerIdentityErasedAt: erasedAt,
        },
      });
      if (changed.count === 0) return false;

      await tx.orderPayment.updateMany({
        where: { orderId: order.id },
        data: { imageUrl: null, note: null },
      });
      if (mediaUrls.length > 0) {
        await tx.assistedOrderMediaDeletion.createMany({
          data: [...new Set(mediaUrls)].map((url) => ({ url })),
          skipDuplicates: true,
        });
      }

      if (
        customerForErasure &&
        !(await hasRemainingCustomerOrders(tx, customerForErasure, order.id))
      ) {
        await tx.customer.updateMany({
          where: {
            id: customerForErasure.id,
            storeId: customerForErasure.storeId,
            phone: customerForErasure.phone,
            identityErasedAt: null,
          },
          data: erasedCustomerData(customerForErasure.id, erasedAt),
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: requestAudit?.operatorId ?? "system",
          storeId: order.storeId,
          action: "order.assisted_identity_erased",
          entityType: "Order",
          entityId: order.id,
          metadata: {
            cause,
            ...(requestAudit
              ? { requestReference: requestAudit.requestReference }
              : {}),
            fields: [
              "customerPhone",
              "customerName",
              "customerEmail",
              "deliveryDetails",
              "buyerAccountId",
              "accessTokenHash",
              "trackingNumber",
              "trackingUrl",
              "packedPhotoUrl",
              "paymentRejectionReason",
              "cancellationReason",
              "OrderPayment.imageUrl",
              "OrderPayment.note",
            ],
          },
        },
      });
      return true;
    });
  }
}

async function hasRemainingCustomerOrders(
  tx: Prisma.TransactionClient,
  customer: { id: string; storeId: string; phone: string },
  excludingOrderId?: string,
): Promise<boolean> {
  const baseWhere = {
    storeId: customer.storeId,
    buyerIdentityErasedAt: null,
    ...(excludingOrderId ? { id: { not: excludingOrderId } } : {}),
  };
  const linkedOrders = await tx.order.count({
    where: { ...baseWhere, customerId: customer.id },
  });
  if (linkedOrders > 0) return true;

  const normalizedUnlinkedOrders = await tx.order.count({
    where: {
      ...baseWhere,
      customerId: null,
      customerPhoneNormalized: customer.phone,
    },
  });
  if (normalizedUnlinkedOrders > 0) return true;

  // Normalize only legacy rows. A saturated scan conservatively retains the
  // Customer instead of risking erasure while a matching order still uses it.
  const legacyUnlinkedOrders = await tx.order.findMany({
    where: {
      ...baseWhere,
      customerId: null,
      customerPhoneNormalized: null,
    },
    select: { customerPhone: true },
    take: RETENTION_BATCH_SIZE + 1,
  });
  if (legacyUnlinkedOrders.length > RETENTION_BATCH_SIZE) return true;
  return legacyUnlinkedOrders.some(
    (row) =>
      row.customerPhone.trim() !== "" &&
      normalizePhone(row.customerPhone) === customer.phone,
  );
}

function isClosed(status: string, fulfillmentStatus: string): boolean {
  return status === "CANCELLED" || fulfillmentStatus === "COMPLETED";
}

function erasedCustomerData(id: string, erasedAt = new Date()) {
  return {
    // Customer.phone is historically required and unique per store. Keep the
    // row/FK stable while replacing the identity key with a non-phone marker.
    phone: `erased:${id}`,
    passwordHash: null,
    email: null,
    emailVerified: false,
    pendingEmail: null,
    pendingPhone: null,
    name: null,
    identityErasedAt: erasedAt,
  };
}
