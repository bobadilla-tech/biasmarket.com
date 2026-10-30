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
