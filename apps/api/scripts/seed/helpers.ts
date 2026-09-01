import { randomUUID } from 'node:crypto';
import type {
  DeliveryMethodType,
  FulfillmentStatus,
  NotificationType,
  PaymentMethodType,
  PaymentReviewStatus,
  PaymentSource,
  PaymentStatus,
  PrismaClient,
  ProductStatus,
  StoreSectionType,
} from '@biasmarket/db';
import type { Prisma } from '@biasmarket/db';
import { hashPassword } from 'better-auth/crypto';

function json(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

// Real upserts everywhere — reruns repair/update every fixture instead of
// the old "skip if any products exist" shortcut, which meant a store that
// already had one product never got the rest of the seed list.
export const SEED_PASSWORD = 'seedpassword123';

export async function ensureUser(
  prisma: PrismaClient,
  input: { email: string; name: string; role: 'admin' | 'seller' },
): Promise<string> {
  const now = new Date();
  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: { name: input.name, role: input.role },
    create: {
      id: randomUUID(),
      name: input.name,
      email: input.email,
      emailVerified: true,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    },
  });

  const hasAccount = await prisma.account.findFirst({
    where: { userId: user.id, providerId: 'credential' },
  });
  if (!hasAccount) {
    await prisma.account.create({
      data: {
        id: randomUUID(),
        accountId: user.id,
        providerId: 'credential',
        userId: user.id,
        password: await hashPassword(SEED_PASSWORD),
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  return user.id;
}

export async function ensureStore(
  prisma: PrismaClient,
  input: {
    ownerId: string;
    name: string;
    slug: string;
    whatsappNumber: string;
    defaultCurrency: string;
    logoUrl?: string;
    paymentInstructions?: string;
    isPublic?: boolean;
    isDemo?: boolean;
    lowStockThreshold?: number;
  },
) {
  return prisma.store.upsert({
    where: { slug: input.slug },
    update: {
      name: input.name,
      ownerId: input.ownerId,
      whatsappNumber: input.whatsappNumber,
      defaultCurrency: input.defaultCurrency,
      logoUrl: input.logoUrl ?? null,
      paymentInstructions: input.paymentInstructions ?? '',
      isPublic: input.isPublic ?? true,
      isDemo: input.isDemo ?? false,
      ...(input.lowStockThreshold !== undefined && {
        lowStockThreshold: input.lowStockThreshold,
      }),
    },
    create: {
      name: input.name,
      slug: input.slug,
      ownerId: input.ownerId,
      themeConfig: {},
      logoUrl: input.logoUrl ?? null,
      paymentInstructions: input.paymentInstructions ?? '',
      whatsappNumber: input.whatsappNumber,
      defaultCurrency: input.defaultCurrency,
      isPublic: input.isPublic ?? true,
      isDemo: input.isDemo ?? false,
      ...(input.lowStockThreshold !== undefined && {
        lowStockThreshold: input.lowStockThreshold,
      }),
    },
  });
}

export async function ensureDeliveryMethod(
  prisma: PrismaClient,
  input: {
    storeId: string;
    type: DeliveryMethodType;
    details: Record<string, unknown>;
  },
) {
  return prisma.deliveryMethodConfig.upsert({
    where: { storeId_type: { storeId: input.storeId, type: input.type } },
    update: { enabled: true, details: json(input.details) },
    create: {
      storeId: input.storeId,
      type: input.type,
      enabled: true,
      details: json(input.details),
    },
  });
}

export async function ensurePickupPoint(
  prisma: PrismaClient,
  input: {
    id: string;
    storeId: string;
    label: string;
    enabled?: boolean;
    sortOrder?: number;
  },
) {
  const data = {
    storeId: input.storeId,
    label: input.label,
    enabled: input.enabled ?? true,
    sortOrder: input.sortOrder ?? 0,
  };
  return prisma.pickupPoint.upsert({
    where: { id: input.id },
    update: data,
    create: { id: input.id, ...data },
  });
}

export async function ensurePaymentMethod(
  prisma: PrismaClient,
  input: {
    storeId: string;
    method: PaymentMethodType;
    enabled?: boolean;
    details?: Record<string, unknown>;
    depositPercent?: number;
  },
) {
  const details = json(input.details ?? {});
  const depositPercent = input.depositPercent ?? 100;
  return prisma.paymentMethodConfig.upsert({
    where: { storeId_method: { storeId: input.storeId, method: input.method } },
    update: { enabled: input.enabled ?? true, details, depositPercent },
    create: {
      storeId: input.storeId,
      method: input.method,
      enabled: input.enabled ?? true,
      details,
      depositPercent,
    },
  });
}

export async function ensureCourier(
  prisma: PrismaClient,
  input: {
    storeId: string;
    name: string;
    enabled?: boolean;
    sortOrder?: number;
    modalities: {
      modality: 'AGENCY' | 'HOME';
      price: string;
      enabled?: boolean;
    }[];
  },
) {
  const courier = await prisma.courier.upsert({
    where: { storeId_name: { storeId: input.storeId, name: input.name } },
    update: { enabled: input.enabled ?? true, sortOrder: input.sortOrder ?? 0 },
    create: {
      storeId: input.storeId,
      name: input.name,
      enabled: input.enabled ?? true,
      sortOrder: input.sortOrder ?? 0,
    },
  });

  for (const m of input.modalities) {
    await prisma.courierConfig.upsert({
      where: {
        courierId_modality: { courierId: courier.id, modality: m.modality },
      },
      update: { price: m.price, enabled: m.enabled ?? true },
      create: {
        courierId: courier.id,
        modality: m.modality,
        price: m.price,
        enabled: m.enabled ?? true,
      },
    });
  }

  // Drop modalities no longer in the spec so reruns converge.
  await prisma.courierConfig.deleteMany({
    where: {
      courierId: courier.id,
      modality: { notIn: input.modalities.map((m) => m.modality) },
    },
  });

  return courier;
}

export async function ensureCategory(
  prisma: PrismaClient,
  input: { storeId: string; parentId: string | null; name: string },
) {
  // Prisma's compound-unique `where` on `[storeId, parentId, name]` requires
  // a non-null parentId (Postgres treats every NULL as distinct, so the
  // constraint can't be used to look up a single top-level row) — fall back
  // to find-then-create/update for top-level categories (parentId: null).
  if (input.parentId === null) {
    const existing = await prisma.category.findFirst({
      where: { storeId: input.storeId, parentId: null, name: input.name },
    });
    if (existing) return existing;
    return prisma.category.create({
      data: { storeId: input.storeId, parentId: null, name: input.name },
    });
  }

  return prisma.category.upsert({
    where: {
      storeId_parentId_name: {
        storeId: input.storeId,
        parentId: input.parentId,
        name: input.name,
      },
    },
    update: {},
    create: {
      storeId: input.storeId,
      parentId: input.parentId,
      name: input.name,
    },
  });
}

export async function ensureCollection(
  prisma: PrismaClient,
  input: { storeId: string; slug: string; name: string; description: string },
) {
  return prisma.collection.upsert({
    where: { storeId_slug: { storeId: input.storeId, slug: input.slug } },
    update: { name: input.name, description: input.description },
    create: {
      storeId: input.storeId,
      slug: input.slug,
      name: input.name,
      description: input.description,
    },
  });
}

export async function ensureCollectionProduct(
  prisma: PrismaClient,
  input: { collectionId: string; productId: string; position: number },
) {
  return prisma.collectionProduct.upsert({
    where: {
      collectionId_productId: {
        collectionId: input.collectionId,
        productId: input.productId,
      },
    },
    update: { position: input.position },
    create: input,
  });
}

export async function ensureProductCategory(
  prisma: PrismaClient,
  input: { productId: string; categoryId: string },
) {
  return prisma.productCategory.upsert({
    where: {
      productId_categoryId: {
        productId: input.productId,
        categoryId: input.categoryId,
      },
    },
    update: {},
    create: input,
  });
}

export async function ensureProduct(
  prisma: PrismaClient,
  input: {
    id: string;
    storeId: string;
    name: string;
    description: string;
    price: string;
    currency: string;
    status: ProductStatus;
    soldOut?: boolean;
    availableUntil?: Date | null;
    images?: string[];
  },
) {
  const data = {
    storeId: input.storeId,
    name: input.name,
    description: input.description,
    price: input.price,
    currency: input.currency,
    status: input.status,
    soldOut: input.soldOut ?? false,
    availableUntil: input.availableUntil ?? null,
    images: input.images ?? [],
  };
  return prisma.product.upsert({
    where: { id: input.id },
    update: data,
    create: { id: input.id, ...data },
  });
}

export async function ensureVariant(
  prisma: PrismaClient,
  input: {
    id: string;
    productId: string;
    storeId: string;
    name: string;
    stock: number | null;
    reserved?: number;
    priceOverride?: string | null;
    imageOverride?: string | null;
    attributes?: Record<string, string>;
  },
) {
  const data = {
    productId: input.productId,
    storeId: input.storeId,
    name: input.name,
    stock: input.stock,
    reserved: input.reserved ?? 0,
    priceOverride: input.priceOverride ?? null,
    imageOverride: input.imageOverride ?? null,
    attributes: input.attributes ?? {},
  };
  return prisma.productVariant.upsert({
    where: { id: input.id },
    update: data,
    create: { id: input.id, ...data },
  });
}

export async function ensureStoreSection(
  prisma: PrismaClient,
  input: {
    id: string;
    storeId: string;
    type: StoreSectionType;
    collectionId?: string | null;
    content: Record<string, unknown>;
    position: number;
  },
) {
  const data = {
    storeId: input.storeId,
    type: input.type,
    collectionId: input.collectionId ?? null,
    content: json(input.content),
    position: input.position,
  };
  return prisma.storeSection.upsert({
    where: { id: input.id },
    update: data,
    create: { id: input.id, ...data },
  });
}

export async function ensureOrder(
  prisma: PrismaClient,
  input: {
    id: string;
    storeId: string;
    customerId?: string | null;
    customerEmail?: string | null;
    customerPhone: string;
    customerName?: string | null;
    deliveryMethodType: DeliveryMethodType;
    deliveryDetails: Record<string, unknown>;
    pickupPointId?: string | null;
    paymentMethod?: PaymentMethodType | null;
    paymentStatus: PaymentStatus;
    paymentRejectionReason?: string | null;
    fulfillmentStatus: FulfillmentStatus;
    status?: 'ACTIVE' | 'CANCELLED';
    cancellationResolution?: 'REFUNDED' | 'RETAINED' | 'STORE_CREDIT' | null;
    cancellationReason?: string | null;
    retainedAmount?: string | null;
    releasedAmount?: string | null;
    releasedResolution?: 'REFUNDED' | 'STORE_CREDIT' | null;
    totalAmount: string;
    requiredAmount: string;
    currency: string;
    expiresAt: Date;
    createdAt?: Date;
  },
) {
  const data = {
    storeId: input.storeId,
    customerId: input.customerId ?? null,
    customerEmail: input.customerEmail ?? null,
    customerPhone: input.customerPhone,
    customerName: input.customerName ?? null,
    deliveryMethodType: input.deliveryMethodType,
    deliveryDetails: json(input.deliveryDetails),
    pickupPointId: input.pickupPointId ?? null,
    paymentMethod: input.paymentMethod ?? null,
    paymentStatus: input.paymentStatus,
    paymentRejectionReason: input.paymentRejectionReason ?? null,
    fulfillmentStatus: input.fulfillmentStatus,
    status: input.status ?? 'ACTIVE',
    cancellationResolution: input.cancellationResolution ?? null,
    cancellationReason: input.cancellationReason ?? null,
    retainedAmount: input.retainedAmount ?? null,
    releasedAmount: input.releasedAmount ?? null,
    releasedResolution: input.releasedResolution ?? null,
    totalAmount: input.totalAmount,
    requiredAmount: input.requiredAmount,
    currency: input.currency,
    expiresAt: input.expiresAt,
  };
  return prisma.order.upsert({
    where: { id: input.id },
    update: data,
    create: { id: input.id, ...data, createdAt: input.createdAt },
  });
}

export async function ensureCustomer(
  prisma: PrismaClient,
  input: {
    storeId: string;
    phone: string;
    email: string;
    name?: string;
    emailVerified?: boolean;
  },
) {
  const data = {
    email: input.email,
    name: input.name ?? null,
    emailVerified: input.emailVerified ?? false,
  };
  return prisma.customer.upsert({
    where: { storeId_phone: { storeId: input.storeId, phone: input.phone } },
    update: data,
    create: { storeId: input.storeId, phone: input.phone, ...data },
  });
}

export async function ensureOrderPayment(
  prisma: PrismaClient,
  input: {
    id: string;
    orderId: string;
    storeId: string;
    amount: string;
    currency: string;
    method?: PaymentMethodType | null;
    note?: string | null;
    imageUrl?: string | null;
    // Default to the schema/`ensureOrderPayment` historical behaviour
    // (SELLER_RECORDED / N_A) when a fixture doesn't say otherwise.
    source?: PaymentSource | null;
    reviewStatus?: PaymentReviewStatus | null;
    createdAt?: Date;
  },
) {
  const data = {
    orderId: input.orderId,
    storeId: input.storeId,
    amount: input.amount,
    currency: input.currency,
    method: input.method ?? null,
    note: input.note ?? null,
    imageUrl: input.imageUrl ?? null,
    source: input.source ?? ('SELLER_RECORDED' as PaymentSource),
    reviewStatus: input.reviewStatus ?? ('N_A' as PaymentReviewStatus),
  };
  return prisma.orderPayment.upsert({
    where: { id: input.id },
    update: data,
    create: { id: input.id, ...data, createdAt: input.createdAt },
  });
}

export async function ensureOrderItem(
  prisma: PrismaClient,
  input: {
    id: string;
    orderId: string;
    storeId: string;
    productId: string;
    variantId?: string | null;
    quantity: number;
    unitPriceAtPurchase: string;
    currency: string;
  },
) {
  const data = {
    orderId: input.orderId,
    storeId: input.storeId,
    productId: input.productId,
    variantId: input.variantId ?? null,
    quantity: input.quantity,
    unitPriceAtPurchase: input.unitPriceAtPurchase,
    currency: input.currency,
  };
  return prisma.orderItem.upsert({
    where: { id: input.id },
    update: data,
    create: { id: input.id, ...data },
  });
}

export async function ensureNotification(
  prisma: PrismaClient,
  input: {
    id: string;
    storeId: string;
    type: NotificationType;
    entityType: string;
    entityId: string;
    title: string;
    body: string;
    read?: boolean;
    archived?: boolean;
  },
) {
  const data = {
    storeId: input.storeId,
    type: input.type,
    entityType: input.entityType,
    entityId: input.entityId,
    title: input.title,
    body: input.body,
    read: input.read ?? false,
    archived: input.archived ?? false,
  };
  return prisma.notification.upsert({
    where: { id: input.id },
    update: data,
    create: { id: input.id, ...data },
  });
}

export async function ensureRestockRequest(
  prisma: PrismaClient,
  input: {
    id: string;
    storeId: string;
    productId: string;
    variantId?: string | null;
    name: string;
    phone: string;
  },
) {
  const data = {
    storeId: input.storeId,
    productId: input.productId,
    variantId: input.variantId ?? null,
    name: input.name,
    phone: input.phone,
  };
  return prisma.restockRequest.upsert({
    where: { id: input.id },
    update: data,
    create: { id: input.id, ...data },
  });
}

export async function ensureAuditLog(
  prisma: PrismaClient,
  input: {
    id: string;
    actorId: string;
    storeId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  },
) {
  const data = {
    actorId: input.actorId,
    storeId: input.storeId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: json(input.metadata ?? {}),
  };
  return prisma.auditLog.upsert({
    where: { id: input.id },
    update: data,
    create: { id: input.id, ...data },
  });
}

export async function ensureContactInquiry(
  prisma: PrismaClient,
  input: {
    id: string;
    name: string;
    email: string;
    company?: string | null;
    inquiryType?: string | null;
    message: string;
  },
) {
  const data = {
    name: input.name,
    email: input.email,
    company: input.company ?? null,
    inquiryType: input.inquiryType ?? null,
    message: input.message,
  };
  return prisma.contactInquiry.upsert({
    where: { id: input.id },
    update: data,
    create: { id: input.id, ...data },
  });
}
