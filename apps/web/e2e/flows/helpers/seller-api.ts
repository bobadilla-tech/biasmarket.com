import { randomUUID } from "node:crypto";
import { request, type APIRequestContext } from "@playwright/test";
import { API_URL, RUN_ID, SELLER_STATE, WEB_URL } from "./env";

// Seeds throwaway data through the seller HTTP API with the stored session.
// The web package never talks to Postgres (hard rule): everything a flow
// needs, a person could do in the dashboard, goes through the same routes.

let counter = 0;

export interface Shop {
  storeId: string;
  slug: string;
  productId: string;
  variantId: string;
  productName: string;
  /** Unit price in PEN; the product costs this much per unit. */
  price: number;
}

export async function sellerApi(): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: API_URL,
    storageState: SELLER_STATE,
    extraHTTPHeaders: { Origin: WEB_URL },
  });
}

async function ok<T>(
  res: Awaited<ReturnType<APIRequestContext["post"]>>,
  what: string,
): Promise<T> {
  if (!res.ok()) {
    throw new Error(`${what} failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export interface ShopOptions {
  /** Deposit % on TRANSFER, for orders that start partially paid. */
  depositPercent?: number;
  price?: number;
  stock?: number;
}

// Own store + one published, imageless product (next.config only allows
// images from localhost:9000, so a product image would break the page).
export async function createShop(
  api: APIRequestContext,
  options: ShopOptions = {},
): Promise<Shop> {
  // Random suffix, not just a counter: Playwright restarts workers (counter
  // back to 0) and --repeat-each re-runs a test in the same run.
  const n = ++counter;
  const slug = `e2e-${RUN_ID}-${n}-${randomUUID().slice(0, 6)}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  const price = options.price ?? 100;
  const store = await ok<{ id: string }>(
    await api.post("/api/stores", {
      data: { name: `E2E ${slug}`, slug, whatsappNumber: "+51900000000" },
    }),
    "create store",
  );
  await ok(
    await api.post(`/api/stores/${store.id}/payment-methods`, {
      data: {
        method: "TRANSFER",
        enabled: true,
        details: {
          bankName: "Banco E2E",
          accountNumber: "0011223344",
          accountHolder: "Tienda E2E",
        },
        ...(options.depositPercent
          ? { depositPercent: options.depositPercent }
          : {}),
      },
    }),
    "configure TRANSFER",
  );
  const productName = `Album ${n}`;
  const product = await ok<{ id: string; variants: { id: string }[] }>(
    await api.post(`/api/stores/${store.id}/products`, {
      data: {
        name: productName,
        price,
        currency: "PEN",
        stock: options.stock ?? 20,
      },
    }),
    "create product",
  );
  await ok(
    await api.patch(`/api/stores/${store.id}/products/${product.id}/publish`),
    "publish product",
  );
  return {
    storeId: store.id,
    slug,
    productId: product.id,
    variantId: product.variants[0]!.id,
    productName,
    price,
  };
}

export interface SellerOrder {
  id: string;
  customerPhone: string;
  paymentStatus: string;
  fulfillmentStatus: string;
}

// Finds the order a flow just created by its (unique) phone, never by
// position or count.
export async function findOrderByPhone(
  api: APIRequestContext,
  storeId: string,
  e164: string,
): Promise<SellerOrder> {
  const rows = await ok<SellerOrder[]>(
    await api.get(`/api/stores/${storeId}/orders`),
    "list orders",
  );
  const found = rows.find((row) => row.customerPhone === e164);
  if (!found) throw new Error(`no order for ${e164} in store ${storeId}`);
  return found;
}

export async function getOrder(
  api: APIRequestContext,
  storeId: string,
  orderId: string,
): Promise<Record<string, unknown>> {
  return ok(
    await api.get(`/api/stores/${storeId}/orders/${orderId}`),
    "get order",
  );
}

export interface ApiOrder {
  id: string;
  /** What the order is called on screen (last 6 of the id, uppercase). */
  number: string;
  /** The buyer's private link. */
  link: string;
}

// Creates an assisted order through the seller API (the UI path is covered by
// the golden path), for specs that are about what the buyer sees afterwards.
// `partial` makes it a pickup deposit order (30% of the total).
export async function createAssistedOrder(
  api: APIRequestContext,
  shop: Shop,
  e164: string,
  options: { partial?: boolean } = {},
): Promise<ApiOrder> {
  const created = await ok<{ order: { id: string }; accessUrl: string }>(
    await api.post(`/api/stores/${shop.storeId}/orders/assisted`, {
      data: {
        deliveryMethodType: "PICKUP",
        customerPhone: e164,
        items: [
          { productId: shop.productId, variantId: shop.variantId, quantity: 1 },
        ],
        ...(options.partial
          ? { paymentMethod: "TRANSFER", paymentType: "PARTIAL" }
          : {}),
      },
    }),
    "create assisted order",
  );
  return {
    id: created.order.id,
    number: created.order.id.slice(-6).toUpperCase(),
    link: created.accessUrl,
  };
}

// A seller-recorded TRANSFER (counts as paid at once; TRANSFER needs a
// capture, so a 1x1 PNG goes along).
export async function recordPayment(
  api: APIRequestContext,
  shop: Shop,
  orderId: string,
  amount: number,
): Promise<void> {
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415478da6360606060000000050001a5f645400000000049454e44ae426082",
    "hex",
  );
  await ok(
    await api.post(`/api/stores/${shop.storeId}/orders/${orderId}/payments`, {
      multipart: {
        amount: amount.toFixed(2),
        method: "TRANSFER",
        paidAt: new Date().toISOString(),
        file: { name: "capture.png", mimeType: "image/png", buffer: png },
      },
    }),
    "record payment",
  );
}

export async function advanceFulfillment(
  api: APIRequestContext,
  shop: Shop,
  orderId: string,
  status: "IN_TRANSIT" | "READY" | "COMPLETED",
): Promise<void> {
  await ok(
    await api.patch(
      `/api/stores/${shop.storeId}/orders/${orderId}/fulfillment`,
      {
        data: { status },
      },
    ),
    `advance to ${status}`,
  );
}
