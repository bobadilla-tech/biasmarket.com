import { Body, Controller, Param, Post } from "@nestjs/common";
import { Public } from "@thallesp/nestjs-better-auth";
import { CreateOrderUseCase } from "../application/create-order.usecase.js";
import { CreateOrderDto } from "../dto/create-order.dto.js";
import type {
  CheckoutOrderItemResponseDto,
  CheckoutOrderResponseDto,
  CheckoutResultResponseDto,
} from "../dto/checkout-response.dto.js";

interface CheckoutOrderItemRow {
  id: string;
  orderId: string;
  storeId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPriceAtPurchase: { toString(): string };
  currency: string;
  createdAt: Date;
}

interface CheckoutOrderRow {
  id: string;
  storeId: string;
  customerId: string | null;
  customerEmail: string | null;
  customerPhone: string;
  customerName: string | null;
  deliveryMethodType: "PICKUP" | "COURIER";
  deliveryDetails: unknown;
  pickupPointId: string | null;
  paymentMethod: "YAPE" | "PLIN" | "TRANSFER" | "CASH" | null;
  paymentStatus:
    | "PENDING_PAYMENT"
    | "PARTIALLY_PAID"
    | "PAYMENT_SUBMITTED"
    | "VERIFIED"
    | "REJECTED"
    | "CANCELLED";
  paymentRejectionReason: string | null;
  fulfillmentStatus: "ORDERING" | "IN_TRANSIT" | "READY" | "COMPLETED";
  status: "ACTIVE" | "CANCELLED";
  cancellationResolution: "REFUNDED" | "RETAINED" | "STORE_CREDIT" | null;
  cancellationReason: string | null;
  totalAmount: { toString(): string };
  requiredAmount: { toString(): string };
  currency: string;
  expiresAt: Date;
  createdAt: Date;
  items: CheckoutOrderItemRow[];
}

function toCheckoutItemDto(
  item: CheckoutOrderItemRow,
): CheckoutOrderItemResponseDto {
  return {
    ...item,
    unitPriceAtPurchase: item.unitPriceAtPurchase.toString(),
    createdAt: item.createdAt.toISOString(),
  };
}

function toCheckoutOrderDto(
  order: CheckoutOrderRow,
): CheckoutOrderResponseDto {
  return {
    ...order,
    deliveryDetails: order.deliveryDetails as Record<string, unknown> | null,
    totalAmount: order.totalAmount.toString(),
    requiredAmount: order.requiredAmount.toString(),
    expiresAt: order.expiresAt.toISOString(),
    createdAt: order.createdAt.toISOString(),
    items: order.items.map(toCheckoutItemDto),
  };
}

@Controller("stores/:slug/checkout")
export class CheckoutController {
  constructor(private createOrder: CreateOrderUseCase) {}

  @Public()
  @Post()
  async create(
    @Param("slug") slug: string,
    @Body() dto: CreateOrderDto,
  ): Promise<CheckoutResultResponseDto> {
    const { order, whatsappUrl } = await this.createOrder.execute(slug, dto);
    return { order: toCheckoutOrderDto(order), whatsappUrl };
  }
}
