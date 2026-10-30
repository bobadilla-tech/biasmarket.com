import { Injectable, NotFoundException } from "@nestjs/common";
import {
  buildWhatsAppOrderMessage,
  buildWhatsAppUrl,
} from "@biasmarket/utils/whatsapp";
import { normalizePhone } from "@biasmarket/utils/phone-country";
import { PrismaService } from "../../../prisma/prisma.service.js";
import type { CreateOrderDto } from "../dto/create-order.dto.js";
import { NotificationsService } from "../../notifications/notifications.service.js";
import { CustomerAccountService } from "./customer-account.service.js";
import {
  lockAndValidate,
  reserveItems,
  validateDeliveryPreTx,
} from "./order-creation.core.js";

@Injectable()
export class CreateOrderUseCase {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private customerAccounts: CustomerAccountService,
  ) {}

  // `proof` is the buyer's checkout-time proof-of-payment upload (already
  // validated + uploaded to the private payment bucket by the controller).
  // When present, the use case attaches a BUYER_SUBMITTED/PENDING_REVIEW
  // OrderPayment row for the full order total in the same transaction that
  // creates the order, so the seller's existing review surface (approve/
  // reject, see .artifacts/2026/08/20260808--buyer-proof-of-payment-upload/plan.md)
  // sees it immediately.
  async execute(
    slug: string,
    dto: CreateOrderDto,
    proof?: { imageUrl: string },
    session?: { buyerAccountId: string; passwordVersion: number },
  ) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException("Tienda no encontrada");

    const pre = await validateDeliveryPreTx(this.prisma, store, dto);

    const {
      order,
      pendingVerificationCustomer,
      pickupPointLabel,
      messageItems,
    } = await this.prisma.$transaction(async (tx) => {
      const locked = await lockAndValidate(tx, store, dto, pre);

      let customerId: string | undefined;
      let buyerAccountId: string | undefined;
      let pendingVerificationCustomer: Awaited<
        ReturnType<CustomerAccountService["findOrCreateCustomer"]>
      > | null = null;
      if (dto.customerEmail) {
        pendingVerificationCustomer =
          await this.customerAccounts.findOrCreateCustomer(
            tx,
            store.id,
            dto.customerPhone,
            dto.customerEmail,
            dto.customerName,
            session,
          );
        customerId = pendingVerificationCustomer.customer?.id;
        buyerAccountId = pendingVerificationCustomer.buyerAccount?.id;
      }

      const { orderData, requiredAmount, messageItems, pickupPointLabel } =
        await reserveItems(tx, this.notifications, store, {
          ...dto,
          ...pre,
          ...locked,
        });

      const order = await tx.order.create({
        data: {
          ...orderData,
          customerId,
          buyerAccountId,
          customerEmail: dto.customerEmail,
          customerPhone: dto.customerPhone,
          customerPhoneNormalized: normalizePhone(dto.customerPhone),
          customerName: dto.customerName,
        },
        include: { items: true },
      });

      // Attach the buyer's proof as a PENDING_REVIEW payment for the
      // required amount (or full amount if no partial). It does NOT count
      // toward paidAmount until the seller approves it
      // (common/payment-summary.ts's `countsTowardPaid`). The seller
      // notification uses the same dedup-as-an-open-notification helper
      // as the buyer account's later submit-proof endpoint.
      if (proof?.imageUrl) {
        await tx.orderPayment.create({
          data: {
            orderId: order.id,
            storeId: store.id,
            amount: requiredAmount,
            currency: order.currency,
            method: dto.paymentMethod,
            imageUrl: proof.imageUrl,
            source: "BUYER_SUBMITTED",
            reviewStatus: "PENDING_REVIEW",
          },
        });
        await this.notifications.createIfNotOpen(
          {
            storeId: store.id,
            type: "PAYMENT_PROOF_SUBMITTED",
            entityType: "Order",
            entityId: order.id,
            title: "Comprobante de pago recibido",
            body: `El comprador envió un comprobante de ${order.currency} ${requiredAmount} para revisar.`,
          },
          tx,
        );
      }

      return {
        order,
        pendingVerificationCustomer,
        pickupPointLabel,
        messageItems,
      };
    });

    // A store's saved NEW_ORDER override (whatsapp-templates module); null
    // when the seller never customized it, in which case
    // buildWhatsAppOrderMessage falls back to the hardcoded default.
    const orderTemplate = store.whatsappNumber
      ? await this.prisma.whatsAppMessageTemplate.findUnique({
          where: {
            storeId_type: { storeId: store.id, type: "NEW_ORDER" },
          },
        })
      : null;

    const whatsappUrl = store.whatsappNumber
      ? buildWhatsAppUrl(
          store.whatsappNumber,
          buildWhatsAppOrderMessage(
            {
              orderId: order.id,
              storeName: store.name,
              items: messageItems,
              totalAmount: order.totalAmount.toNumber(),
              currency: order.currency,
              deliveryMethodType: order.deliveryMethodType,
              pickupPointLabel,
              pickupDate: order.pickupDate,
              paymentMethod: order.paymentMethod,
              customerName: order.customerName,
              customerPhone: order.customerPhone,
            },
            orderTemplate?.template,
          ),
        )
      : null;

    if (
      pendingVerificationCustomer?.needsVerificationEmail &&
      pendingVerificationCustomer.buyerAccount
    ) {
      await this.customerAccounts.sendVerificationEmail(
        pendingVerificationCustomer.buyerAccount,
        store,
      );
    }

    return { order, whatsappUrl };
  }
}
