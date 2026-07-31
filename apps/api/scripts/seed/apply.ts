import type { PrismaClient } from '@biasmarket/db';
import { seedId } from './ids.ts';
import * as db from './helpers.ts';
import type { StoreFixtureSpec } from './fixtures.ts';
import { createCustomerAccountToken } from '../../src/modules/orders/application/customer-account-token.ts';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function buildCustomerConfirmUrl(storeSlug: string, customerId: string): string {
  const secret = requiredEnv('BETTER_AUTH_SECRET');
  const webUrl = process.env.WEB_URL ?? 'http://localhost:3001';
  const token = createCustomerAccountToken(customerId, secret);
  return `${webUrl}/store/${storeSlug}/account/confirm?token=${token}`;
}

export async function applyStoreFixture(
  prisma: PrismaClient,
  batch: string,
  spec: StoreFixtureSpec,
): Promise<{
  store: Awaited<ReturnType<typeof db.ensureStore>>;
  unverifiedCustomerLinks: { email: string; url: string }[];
}> {
  const ownerId = await db.ensureUser(prisma, {
    email: spec.seller.email,
    name: spec.seller.name,
    role: 'seller',
  });
  const store = await db.ensureStore(prisma, { ownerId, ...spec.store });

  const customerIds = new Map<string, string>();
  const unverifiedCustomerLinks: { email: string; url: string }[] = [];
  for (const customer of spec.customers) {
    const row = await db.ensureCustomer(prisma, {
      storeId: store.id,
      phone: customer.phone,
      email: customer.email,
      name: customer.name,
      emailVerified: customer.emailVerified,
    });
    customerIds.set(customer.key, row.id);
    if (!row.emailVerified) {
      unverifiedCustomerLinks.push({
        email: customer.email,
        url: buildCustomerConfirmUrl(store.slug, row.id),
      });
    }
  }

  for (const dm of spec.deliveryMethods) {
    await db.ensureDeliveryMethod(prisma, { storeId: store.id, type: dm.type, details: dm.details });
  }

  for (const method of ['YAPE', 'PLIN', 'TRANSFER', 'CASH'] as const) {
    await db.ensurePaymentMethod(prisma, { storeId: store.id, method, enabled: true });
  }

  const pickupPointIds = new Map<string, string>();
  for (const [index, point] of spec.pickupPoints.entries()) {
    const id = seedId(batch, 'pickup-point', store.slug, point.key);
    await db.ensurePickupPoint(prisma, {
      id,
      storeId: store.id,
      label: point.label,
      enabled: point.enabled,
      sortOrder: index,
    });
    pickupPointIds.set(point.key, id);
  }

  const categoryIds = new Map<string, string>();
  for (const cat of spec.categories.filter((c) => !c.parentKey)) {
    const row = await db.ensureCategory(prisma, { storeId: store.id, parentId: null, name: cat.name });
    categoryIds.set(cat.key, row.id);
  }
  for (const cat of spec.categories.filter((c) => c.parentKey)) {
    const parentId = categoryIds.get(cat.parentKey!) ?? null;
    const row = await db.ensureCategory(prisma, { storeId: store.id, parentId, name: cat.name });
    categoryIds.set(cat.key, row.id);
  }

  const productIds = new Map<string, string>();
  const variantIds = new Map<string, string>(); // key: `${productKey}:${variantKey}`

  for (const product of spec.products) {
    const productId = seedId(batch, 'product', store.slug, product.key);
    await db.ensureProduct(prisma, {
      id: productId,
      storeId: store.id,
      name: product.name,
      description: product.description,
      price: product.price,
      currency: spec.store.defaultCurrency,
      status: product.status,
      soldOut: product.soldOut,
      availableUntil: product.availableUntil ?? null,
    });
    productIds.set(product.key, productId);

    for (const categoryKey of product.categoryKeys ?? []) {
      const categoryId = categoryIds.get(categoryKey);
      if (categoryId) await db.ensureProductCategory(prisma, { productId, categoryId });
    }

    for (const variant of product.variants ?? []) {
      const variantId = seedId(batch, 'variant', store.slug, product.key, variant.key);
      await db.ensureVariant(prisma, {
        id: variantId,
        productId,
        storeId: store.id,
        name: variant.name,
        stock: variant.stock,
        reserved: variant.reserved,
        priceOverride: variant.priceOverride,
        imageOverride: variant.imageOverride,
        attributes: variant.attributes,
      });
      variantIds.set(`${product.key}:${variant.key}`, variantId);
    }
  }

  const collectionIds = new Map<string, string>();
  for (const collection of spec.collections) {
    const row = await db.ensureCollection(prisma, {
      storeId: store.id,
      slug: collection.slug,
      name: collection.name,
      description: collection.description,
    });
    collectionIds.set(collection.key, row.id);

    for (const [position, productKey] of collection.productKeys.entries()) {
      const productId = productIds.get(productKey);
      if (productId) {
        await db.ensureCollectionProduct(prisma, { collectionId: row.id, productId, position });
      }
    }
  }

  for (const section of spec.sections) {
    await db.ensureStoreSection(prisma, {
      id: seedId(batch, 'section', store.slug, section.key),
      storeId: store.id,
      type: section.type,
      collectionId: section.collectionKey ? collectionIds.get(section.collectionKey) : null,
      content: section.content,
      position: section.position,
    });
  }

  for (const order of spec.orders) {
    const orderId = seedId(batch, 'order', store.slug, order.key);
    let subtotal = 0;
    const resolvedItems: { productKey: string; variantKey?: string; quantity: number; unitPrice: number }[] = [];

    for (const item of order.items) {
      const product = spec.products.find((p) => p.key === item.productKey);
      if (!product) continue;
      const variant = item.variantKey ? product.variants?.find((v) => v.key === item.variantKey) : undefined;
      const unitPrice = Number(variant?.priceOverride ?? product.price);
      subtotal += unitPrice * item.quantity;
      resolvedItems.push({ ...item, unitPrice });
    }

    const baseDeliveryDetails =
      spec.deliveryMethods.find((d) => d.type === order.deliveryMethodType)?.details ?? {};
    const deliveryCost = Number((baseDeliveryDetails as Record<string, unknown>)['estimatedCost'] ?? 0);
    const finalAmount = (subtotal + deliveryCost).toFixed(2);

    const pickupPointId = order.pickupPointKey ? (pickupPointIds.get(order.pickupPointKey) ?? null) : null;
    const pickupPointLabel = order.pickupPointKey
      ? spec.pickupPoints.find((p) => p.key === order.pickupPointKey)?.label
      : undefined;
    const deliveryDetails = pickupPointLabel
      ? { ...baseDeliveryDetails, pickupPointLabel }
      : baseDeliveryDetails;

    const createdAt = order.createdDaysAgo
      ? new Date(Date.now() - order.createdDaysAgo * 24 * 60 * 60 * 1000)
      : undefined;

    const customer = order.customerKey ? spec.customers.find((c) => c.key === order.customerKey) : undefined;
    const customerId = order.customerKey ? (customerIds.get(order.customerKey) ?? null) : null;

    await db.ensureOrder(prisma, {
      id: orderId,
      storeId: store.id,
      customerId,
      customerEmail: customer?.email ?? order.customerEmail,
      customerPhone: customer?.phone ?? order.customerPhone,
      customerName: customer?.name ?? order.customerName,
      deliveryMethodType: order.deliveryMethodType,
      deliveryDetails,
      pickupPointId,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      totalAmount: finalAmount,
      requiredAmount: finalAmount,
      currency: spec.store.defaultCurrency,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      createdAt,
    });

    for (const [index, item] of resolvedItems.entries()) {
      await db.ensureOrderItem(prisma, {
        id: seedId(batch, 'order-item', store.slug, order.key, String(index)),
        orderId,
        storeId: store.id,
        productId: productIds.get(item.productKey)!,
        variantId: item.variantKey ? variantIds.get(`${item.productKey}:${item.variantKey}`) : null,
        quantity: item.quantity,
        unitPriceAtPurchase: item.unitPrice.toFixed(2),
        currency: spec.store.defaultCurrency,
      });
    }

    for (const payment of order.payments ?? []) {
      const paymentCreatedAt = payment.createdDaysAgo
        ? new Date(Date.now() - payment.createdDaysAgo * 24 * 60 * 60 * 1000)
        : createdAt;
      await db.ensureOrderPayment(prisma, {
        id: seedId(batch, 'order-payment', store.slug, order.key, payment.key),
        orderId,
        storeId: store.id,
        amount: payment.amount,
        currency: spec.store.defaultCurrency,
        method: payment.method,
        note: payment.note,
        createdAt: paymentCreatedAt,
      });
    }
  }

  console.log(`[${batch}] seeded store ${store.slug} (${spec.products.length} products, ${spec.orders.length} orders)`);
  return { store, unverifiedCustomerLinks };
}
