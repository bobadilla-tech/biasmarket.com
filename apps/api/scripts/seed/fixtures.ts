// Pure data — no Prisma calls here. `apply.ts` turns these specs into real
// rows. Every seller/store/customer-facing string is prefixed `seed-`/`demo-`
// so seeded data stays identifiable (and filterable) if this ever runs
// against prod. Admin accounts are the exception — those are the actual
// documented dev/ops logins, not "demo" data testers browse.

export interface VariantSpec {
  key: string;
  name: string;
  stock: number | null; // null = unlimited / made-to-order
  reserved?: number;
  priceOverride?: string;
  imageOverride?: string;
  attributes?: Record<string, string>;
}

export interface ProductSpec {
  key: string;
  name: string;
  description: string;
  price: string;
  status: "DRAFT" | "PUBLISHED";
  soldOut?: boolean;
  availableUntil?: Date;
  categoryKeys?: string[];
  images?: string[];
  variants?: VariantSpec[];
}

export interface PaymentMethodSpec {
  method: "YAPE" | "PLIN" | "TRANSFER" | "CASH";
  enabled?: boolean;
  details?: Record<string, unknown>;
}

export interface RestockRequestSpec {
  key: string;
  productKey: string;
  variantKey?: string;
  name: string;
  phone: string;
}

export interface CategorySpec {
  key: string;
  name: string;
  parentKey?: string;
}

export interface CollectionSpec {
  key: string;
  name: string;
  slug: string;
  description: string;
  productKeys: string[]; // order = CollectionProduct.position
}

export interface SectionSpec {
  key: string;
  type: "COLLECTION" | "BANNER" | "TEXT_BLOCK";
  collectionKey?: string;
  content: Record<string, unknown>;
  position: number;
}

export interface OrderItemSpec {
  productKey: string;
  variantKey?: string;
  quantity: number;
}

export interface OrderPaymentSpec {
  key: string;
  amount: string;
  method?: "YAPE" | "PLIN" | "TRANSFER" | "CASH";
  note?: string;
  imageUrl?: string;
  createdDaysAgo?: number;
}

export interface OrderCancellationSpec {
  resolution: "REFUNDED" | "RETAINED" | "STORE_CREDIT";
  reason?: string;
  retainedAmount?: string;
  releasedAmount?: string;
  releasedResolution?: "REFUNDED" | "STORE_CREDIT";
}

export interface OrderSpec {
  key: string;
  customerPhone: string;
  customerName?: string;
  customerEmail?: string;
  customerKey?: string;
  deliveryMethodType: "PICKUP" | "COURIER";
  pickupPointKey?: string;
  paymentMethod?: "YAPE" | "PLIN" | "TRANSFER" | "CASH";
  paymentStatus:
    | "PENDING_PAYMENT"
    | "PARTIALLY_PAID"
    | "PAYMENT_SUBMITTED"
    | "VERIFIED"
    | "REJECTED"
    | "CANCELLED";
  rejectionReason?: string;
  fulfillmentStatus: "ORDERING" | "IN_TRANSIT" | "READY" | "COMPLETED";
  items: OrderItemSpec[];
  payments?: OrderPaymentSpec[];
  cancellation?: OrderCancellationSpec;
  createdDaysAgo?: number;
}

export interface PickupPointSpec {
  key: string;
  label: string;
  enabled?: boolean;
}

export interface CustomerSpec {
  key: string;
  phone: string;
  email: string;
  name?: string;
  emailVerified?: boolean;
}

export interface ContactInquirySpec {
  key: string;
  name: string;
  email: string;
  company?: string;
  inquiryType?: string;
  message: string;
}

export interface StoreFixtureSpec {
  seller: { email: string; name: string };
  store: {
    name: string;
    slug: string;
    whatsappNumber: string;
    defaultCurrency: string;
    logoUrl?: string;
    paymentInstructions?: string;
    isPublic?: boolean;
    lowStockThreshold?: number;
  };
  deliveryMethods: {
    type: "PICKUP" | "COURIER";
    details: Record<string, unknown>;
  }[];
  paymentMethods?: PaymentMethodSpec[];
  pickupPoints: PickupPointSpec[];
  categories: CategorySpec[];
  products: ProductSpec[];
  collections: CollectionSpec[];
  sections: SectionSpec[];
  customers: CustomerSpec[];
  orders: OrderSpec[];
  restockRequests?: RestockRequestSpec[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const pastDate = () => new Date(Date.now() - 10 * DAY_MS);
const futureDate = () => new Date(Date.now() + 90 * DAY_MS);

function camilaStore(): StoreFixtureSpec {
  return {
    seller: { email: "seed-seller1@biasmarket.dev", name: "Camila Seller" },
    store: {
      name: "Tienda de Camila",
      slug: "demo-tienda-de-camila",
      whatsappNumber: "+51987654321",
      defaultCurrency: "PEN",
      logoUrl: "https://placehold.co/200x200?text=Camila",
      paymentInstructions:
        "Yape/Plin al +51 987 654 321 (Camila Seller) o transferencia BCP " +
        "cuenta 193-1234567-0-89, CCI 00219300123456789012. Envía tu " +
        "comprobante por WhatsApp para confirmar tu pedido.",
      // Demo store — reachable via direct link for QA/testing, but kept out
      // of the homepage/directory search (see Store.isPublic).
      isPublic: false,
    },
    deliveryMethods: [
      { type: "PICKUP", details: {} },
      { type: "COURIER", details: { estimatedCost: "8.00" } },
    ],
    pickupPoints: [
      { key: "alameda", label: "Alameda 28 de Julio" },
      { key: "plaza-norte", label: "Plaza Norte" },
      {
        key: "estacion-angamos",
        label: "Estación Angamos - Línea 1",
        enabled: false,
      },
    ],
    categories: [
      { key: "albumes", name: "Álbumes" },
      {
        key: "albumes-photobook",
        name: "Photobook Edition",
        parentKey: "albumes",
      },
      { key: "merch", name: "Merch" },
    ],
    products: [
      {
        key: "photobook",
        name: "Álbum Photobook Edition",
        description: "Álbum oficial con photobook de 80 páginas.",
        price: "45.00",
        status: "PUBLISHED",
        categoryKeys: ["albumes-photobook"],
        images: [
          "https://placehold.co/600x600?text=Photobook",
          "https://placehold.co/600x600?text=Photobook+2",
        ],
        variants: [
          {
            key: "a",
            name: "Versión A",
            stock: 5,
            attributes: { version: "A" },
          },
          {
            key: "b",
            name: "Versión B",
            stock: 0,
            attributes: { version: "B" },
          }, // sold out
        ],
      },
      {
        key: "photocards",
        name: "Photocard Set",
        description: "Set de 5 photocards random.",
        price: "15.00",
        status: "PUBLISHED",
        categoryKeys: ["merch"],
        images: ["https://placehold.co/600x600?text=Photocards"],
        // no variants = unlimited stock
      },
      {
        key: "lightstick",
        name: "Lightstick Oficial",
        description: "Lightstick con bluetooth, edición actual.",
        price: "60.00",
        status: "PUBLISHED",
        categoryKeys: ["merch"],
        images: ["https://placehold.co/600x600?text=Lightstick"],
        variants: [{ key: "default", name: "Estándar", stock: 1 }], // low stock
      },
      {
        key: "keyring-draft",
        name: "Llavero Bordado (Preview)",
        description:
          "Todavía en preview, no debería verse en la tienda pública.",
        price: "8.00",
        status: "DRAFT",
        images: ["https://placehold.co/600x600?text=Llavero"],
      },
      {
        key: "poster-expired",
        name: "Poster Edición Limitada 2025",
        description: "Edición limitada, disponibilidad ya vencida.",
        price: "18.00",
        status: "PUBLISHED",
        availableUntil: pastDate(),
        images: ["https://placehold.co/600x600?text=Poster"],
      },
      {
        key: "lightstick-v2",
        name: "Lightstick Bluetooth v2",
        description: "Nueva versión, disponible por tiempo limitado.",
        price: "65.00",
        status: "PUBLISHED",
        availableUntil: futureDate(),
        images: ["https://placehold.co/600x600?text=Lightstick+v2"],
        variants: [{ key: "std", name: "Estándar", stock: null }], // unlimited
      },
      {
        key: "bundle-reserved",
        name: "Bundle Reservado Demo",
        description:
          "Bundle con una unidad ya reservada por un pedido pendiente.",
        price: "30.00",
        status: "PUBLISHED",
        images: ["https://placehold.co/600x600?text=Bundle"],
        variants: [{ key: "only", name: "Único", stock: 3, reserved: 2 }], // available = 1
      },
      {
        key: "photocard-override",
        name: "Photocard Premium",
        description: "Edición gold con precio e imagen propios.",
        price: "10.00",
        status: "PUBLISHED",
        images: ["https://placehold.co/600x600?text=Photocard+Premium"],
        variants: [
          {
            key: "gold",
            name: "Gold Edition",
            stock: 4,
            priceOverride: "14.00",
            imageOverride: "https://placehold.co/400x400?text=Gold",
          },
        ],
      },
    ],
    collections: [
      {
        key: "destacados",
        name: "Destacados",
        slug: "destacados",
        description: "Lo más pedido.",
        productKeys: ["photobook", "lightstick", "bundle-reserved"],
      },
      {
        key: "nuevos",
        name: "Nuevos Ingresos",
        slug: "nuevos-ingresos",
        description: "Recién agregado al catálogo.",
        productKeys: ["lightstick-v2", "photocard-override"],
      },
    ],
    sections: [
      {
        key: "destacados",
        type: "COLLECTION",
        collectionKey: "destacados",
        content: { title: "Destacados" },
        position: 0,
      },
      {
        key: "banner",
        type: "BANNER",
        content: {
          imageUrl: "https://placehold.co/1200x400?text=Bias+Market",
          headline: "Envíos a todo el país",
        },
        position: 1,
      },
      {
        key: "about",
        type: "TEXT_BLOCK",
        content: {
          title: "Sobre la tienda",
          body: "Tienda oficial de merch, pagos por transferencia o Yape.",
        },
        position: 2,
      },
    ],
    customers: [
      {
        key: "bruno",
        phone: "+51900000002",
        email: "seed-bruno@example.com",
        name: "Bruno Test",
        emailVerified: false,
      },
      {
        key: "ana",
        phone: "+51900000007",
        email: "seed-ana@example.com",
        name: "Ana Verified",
        emailVerified: true,
      },
    ],
    orders: [
      {
        key: "pending",
        customerPhone: "+51900000001",
        customerName: "Ana Test",
        deliveryMethodType: "PICKUP",
        pickupPointKey: "alameda",
        paymentMethod: "YAPE",
        paymentStatus: "PENDING_PAYMENT",
        fulfillmentStatus: "ORDERING",
        items: [{ productKey: "photocards", quantity: 2 }],
      },
      {
        key: "submitted",
        customerPhone: "+51900000002",
        customerEmail: "seed-bruno@example.com",
        customerKey: "bruno",
        deliveryMethodType: "COURIER",
        paymentMethod: "TRANSFER",
        paymentStatus: "PAYMENT_SUBMITTED",
        fulfillmentStatus: "ORDERING",
        items: [{ productKey: "photobook", variantKey: "a", quantity: 1 }],
        createdDaysAgo: 1,
      },
      {
        key: "ana-completed",
        customerPhone: "+51900000007",
        customerEmail: "seed-ana@example.com",
        customerKey: "ana",
        deliveryMethodType: "COURIER",
        paymentMethod: "TRANSFER",
        paymentStatus: "VERIFIED",
        fulfillmentStatus: "COMPLETED",
        items: [{ productKey: "photocards", quantity: 1 }],
        payments: [{
          key: "full",
          amount: "23.00",
          method: "TRANSFER",
          note: "Pago completo",
          imageUrl: "https://placehold.co/500x700?text=Comprobante",
        }],
        createdDaysAgo: 6,
      },
      {
        key: "ana-pending",
        customerPhone: "+51900000007",
        customerEmail: "seed-ana@example.com",
        customerKey: "ana",
        deliveryMethodType: "PICKUP",
        pickupPointKey: "plaza-norte",
        paymentMethod: "CASH",
        paymentStatus: "PENDING_PAYMENT",
        fulfillmentStatus: "ORDERING",
        items: [{
          productKey: "lightstick",
          variantKey: "default",
          quantity: 1,
        }],
      },
      {
        key: "partial",
        customerPhone: "+51900000008",
        customerName: "Diego Partial",
        deliveryMethodType: "PICKUP",
        pickupPointKey: "alameda",
        paymentMethod: "YAPE",
        paymentStatus: "PARTIALLY_PAID",
        fulfillmentStatus: "ORDERING",
        items: [{ productKey: "photobook", variantKey: "a", quantity: 1 }],
        payments: [{
          key: "first",
          amount: "15.00",
          method: "YAPE",
          note: "Adelanto",
          imageUrl: "https://placehold.co/500x700?text=Yape+Adelanto",
        }],
        createdDaysAgo: 1,
      },
      {
        key: "verified-transit",
        customerPhone: "+51900000003",
        deliveryMethodType: "COURIER",
        paymentMethod: "TRANSFER",
        paymentStatus: "VERIFIED",
        fulfillmentStatus: "IN_TRANSIT",
        items: [{
          productKey: "lightstick",
          variantKey: "default",
          quantity: 1,
        }],
        payments: [{
          key: "full",
          amount: "68.00",
          method: "TRANSFER",
          note: "Pago completo",
        }],
        createdDaysAgo: 3,
      },
      {
        key: "verified-completed",
        customerPhone: "+51900000004",
        deliveryMethodType: "PICKUP",
        pickupPointKey: "plaza-norte",
        paymentMethod: "TRANSFER",
        paymentStatus: "VERIFIED",
        fulfillmentStatus: "COMPLETED",
        items: [{
          productKey: "lightstick-v2",
          variantKey: "std",
          quantity: 2,
        }],
        payments: [{
          key: "full",
          amount: "130.00",
          method: "TRANSFER",
          note: "Pago completo",
        }],
        createdDaysAgo: 7,
      },
      {
        key: "rejected",
        customerPhone: "+51900000005",
        deliveryMethodType: "PICKUP",
        pickupPointKey: "alameda",
        paymentMethod: "PLIN",
        paymentStatus: "REJECTED",
        rejectionReason: "El comprobante no corresponde al monto del pedido.",
        fulfillmentStatus: "ORDERING",
        items: [{
          productKey: "photocard-override",
          variantKey: "gold",
          quantity: 1,
        }],
        createdDaysAgo: 2,
      },
      {
        key: "cancelled",
        customerPhone: "+51900000006",
        deliveryMethodType: "COURIER",
        paymentMethod: "YAPE",
        paymentStatus: "CANCELLED",
        fulfillmentStatus: "ORDERING",
        items: [{
          productKey: "bundle-reserved",
          variantKey: "only",
          quantity: 1,
        }],
        payments: [{
          key: "advance",
          amount: "20.00",
          method: "YAPE",
          note: "Adelanto antes de cancelar",
        }],
        // Partial retain: keeps a cancellation fee, releases the rest as
        // store credit — exercises the RETAINED/PARTIAL branch of
        // CancelOrderUseCase (see cancel-order.usecase.ts) alongside the
        // simpler REFUNDED case seeded on K-Pop Corner below.
        cancellation: {
          resolution: "RETAINED",
          reason: "Cliente canceló fuera de plazo, se retiene fee de gestión.",
          retainedAmount: "10.00",
          releasedAmount: "10.00",
          releasedResolution: "STORE_CREDIT",
        },
        createdDaysAgo: 4,
      },
    ],
    restockRequests: [
      {
        key: "photobook-b",
        productKey: "photobook",
        variantKey: "b",
        name: "Fiorella Restock",
        phone: "+51955555555",
      },
    ],
  };
}

function kpopCornerStore(): StoreFixtureSpec {
  return {
    seller: { email: "seed-seller2@biasmarket.dev", name: "K-Pop Corner" },
    store: {
      name: "K-Pop Corner",
      slug: "demo-kpop-corner",
      whatsappNumber: "+51912345678",
      defaultCurrency: "PEN",
      logoUrl: "https://placehold.co/200x200?text=KPC",
      paymentInstructions:
        "Yape/Plin al +51 912 345 678 (K-Pop Corner) o transferencia " +
        "Interbank cuenta 898-3001234567, CCI 00389800300123456712. " +
        "Envía tu comprobante por WhatsApp para confirmar tu pedido.",
      isPublic: false,
    },
    deliveryMethods: [
      { type: "PICKUP", details: {} },
      { type: "COURIER", details: { estimatedCost: "10.00" } },
    ],
    pickupPoints: [
      { key: "estacion-central", label: "Estación Central - Metropolitano" },
      {
        key: "cc-jockey",
        label: "Jockey Plaza - Patio de comidas",
        enabled: false,
      },
    ],
    categories: [
      { key: "posters", name: "Posters" },
      { key: "photocards", name: "Photocards" },
      {
        key: "photocards-signed",
        name: "Firmados",
        parentKey: "photocards",
      },
    ],
    products: [
      {
        key: "poster",
        name: "Poster Oficial",
        description: "Poster A2 enrollado, envío protegido.",
        price: "20.00",
        status: "PUBLISHED",
        categoryKeys: ["posters"],
        images: ["https://placehold.co/600x600?text=Poster"],
      },
      {
        key: "member-set",
        name: "Photocard Member Set",
        description: "Photocard random por miembro.",
        price: "12.00",
        status: "PUBLISHED",
        categoryKeys: ["photocards"],
        images: ["https://placehold.co/600x600?text=Member+Set"],
        variants: [
          {
            key: "jk",
            name: "Jungkook",
            stock: 2,
            attributes: { member: "Jungkook" },
          },
          { key: "v", name: "V", stock: 0, attributes: { member: "V" } }, // sold out
        ],
      },
      {
        key: "bundle",
        name: "Merch Bundle",
        description: "Bundle con llavero + sticker pack.",
        price: "25.00",
        status: "PUBLISHED",
        images: ["https://placehold.co/600x600?text=Bundle"],
        variants: [{ key: "only", name: "Único", stock: null }],
      },
      {
        key: "album-draft",
        name: "Álbum Repackage (Preview)",
        description: "Todavía en preview, no debería verse en la tienda.",
        price: "42.00",
        status: "DRAFT",
        images: ["https://placehold.co/600x600?text=Repackage"],
      },
      {
        key: "poster-expired",
        name: "Poster Concierto 2025",
        description: "Edición de concierto, disponibilidad ya vencida.",
        price: "22.00",
        status: "PUBLISHED",
        availableUntil: pastDate(),
        images: ["https://placehold.co/600x600?text=Poster+Concierto"],
      },
      {
        key: "photocard-signed",
        name: "Photocard Firmado",
        description: "Edición firmada, unidad limitada ya reservada.",
        price: "35.00",
        status: "PUBLISHED",
        categoryKeys: ["photocards-signed"],
        images: ["https://placehold.co/600x600?text=Firmado"],
        variants: [
          {
            key: "only",
            name: "Único",
            stock: 2,
            reserved: 1,
            priceOverride: "40.00",
            imageOverride: "https://placehold.co/400x400?text=Firmado+Gold",
          }, // available = 1
        ],
      },
    ],
    collections: [
      {
        key: "catalogo",
        name: "Todo el Catálogo",
        slug: "catalogo",
        description: "Todos los productos disponibles.",
        productKeys: ["poster", "member-set", "bundle"],
      },
    ],
    sections: [
      {
        key: "catalogo",
        type: "COLLECTION",
        collectionKey: "catalogo",
        content: { title: "Catálogo" },
        position: 0,
      },
      {
        key: "banner",
        type: "BANNER",
        content: {
          imageUrl: "https://placehold.co/1200x400?text=K-Pop+Corner",
          headline: "Nuevo stock cada semana",
        },
        position: 1,
      },
      {
        key: "about",
        type: "TEXT_BLOCK",
        content: {
          title: "Sobre la tienda",
          body:
            "Importamos directo de Corea. Pagos por Yape, Plin o transferencia.",
        },
        position: 2,
      },
    ],
    customers: [
      {
        key: "sofia",
        phone: "+51922222222",
        email: "seed-sofia@example.com",
        name: "Sofia Test",
        emailVerified: true,
      },
      {
        key: "renzo",
        phone: "+51933333333",
        email: "seed-renzo@example.com",
        name: "Renzo Unverified",
        emailVerified: false,
      },
    ],
    orders: [
      {
        key: "pending",
        customerPhone: "+51911111111",
        deliveryMethodType: "PICKUP",
        pickupPointKey: "estacion-central",
        paymentMethod: "PLIN",
        paymentStatus: "PENDING_PAYMENT",
        fulfillmentStatus: "ORDERING",
        items: [{ productKey: "poster", quantity: 1 }],
      },
      {
        key: "submitted",
        customerPhone: "+51933333333",
        customerEmail: "seed-renzo@example.com",
        customerKey: "renzo",
        deliveryMethodType: "COURIER",
        paymentMethod: "YAPE",
        paymentStatus: "PAYMENT_SUBMITTED",
        fulfillmentStatus: "ORDERING",
        items: [{ productKey: "bundle", variantKey: "only", quantity: 1 }],
        createdDaysAgo: 1,
      },
      {
        key: "partial",
        customerPhone: "+51944444444",
        customerName: "Kevin Partial",
        deliveryMethodType: "PICKUP",
        pickupPointKey: "estacion-central",
        paymentMethod: "TRANSFER",
        paymentStatus: "PARTIALLY_PAID",
        fulfillmentStatus: "ORDERING",
        items: [{
          productKey: "photocard-signed",
          variantKey: "only",
          quantity: 1,
        }],
        payments: [{
          key: "first",
          amount: "20.00",
          method: "TRANSFER",
          note: "Adelanto",
          imageUrl: "https://placehold.co/500x700?text=Comprobante",
        }],
        createdDaysAgo: 1,
      },
      {
        key: "verified-transit",
        customerPhone: "+51955555555",
        deliveryMethodType: "COURIER",
        paymentMethod: "TRANSFER",
        paymentStatus: "VERIFIED",
        fulfillmentStatus: "IN_TRANSIT",
        items: [{ productKey: "poster", quantity: 2 }],
        payments: [{
          key: "full",
          amount: "50.00",
          method: "TRANSFER",
          note: "Pago completo",
        }],
        createdDaysAgo: 3,
      },
      {
        key: "verified-completed",
        customerPhone: "+51922222222",
        customerName: "Sofia Test",
        customerEmail: "seed-sofia@example.com",
        customerKey: "sofia",
        deliveryMethodType: "COURIER",
        paymentMethod: "TRANSFER",
        paymentStatus: "VERIFIED",
        fulfillmentStatus: "COMPLETED",
        items: [{ productKey: "member-set", variantKey: "jk", quantity: 1 }],
        payments: [{
          key: "full",
          amount: "22.00",
          method: "TRANSFER",
          note: "Pago completo",
        }],
        createdDaysAgo: 5,
      },
      {
        key: "rejected",
        customerPhone: "+51966666666",
        deliveryMethodType: "PICKUP",
        pickupPointKey: "estacion-central",
        paymentMethod: "YAPE",
        paymentStatus: "REJECTED",
        rejectionReason: "No se encontró el pago con el número indicado.",
        fulfillmentStatus: "ORDERING",
        items: [{ productKey: "member-set", variantKey: "jk", quantity: 1 }],
        createdDaysAgo: 2,
      },
      {
        key: "cancelled",
        customerPhone: "+51977777777",
        deliveryMethodType: "COURIER",
        paymentMethod: "PLIN",
        paymentStatus: "CANCELLED",
        fulfillmentStatus: "ORDERING",
        items: [{ productKey: "bundle", variantKey: "only", quantity: 1 }],
        // Full refund, no cancellation fee — the simpler counterpart to
        // Camila's RETAINED/PARTIAL case above.
        cancellation: {
          resolution: "REFUNDED",
          reason: "Producto ya no disponible en el color solicitado.",
        },
        createdDaysAgo: 4,
      },
    ],
    restockRequests: [
      {
        key: "member-set-v",
        productKey: "member-set",
        variantKey: "v",
        name: "Camila Restock",
        phone: "+51988888888",
      },
    ],
  };
}

export function buildBaseFixtures(): {
  admins: { email: string; name: string }[];
  stores: StoreFixtureSpec[];
} {
  return {
    admins: [
      { email: "admin@biasmarket.dev", name: "Dev Admin" },
      { email: "owner@biasmarket.dev", name: "Dev Owner" },
    ],
    stores: [camilaStore(), kpopCornerStore()],
  };
}

export function buildAppendFixture(label: string): StoreFixtureSpec {
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return {
    seller: {
      email: `seed-seller-${safeLabel}@biasmarket.dev`,
      name: `Demo Seller ${label}`,
    },
    store: {
      name: `Demo Store ${label}`,
      slug: `demo-${safeLabel}`,
      whatsappNumber: "+51900000000",
      defaultCurrency: "PEN",
    },
    deliveryMethods: [
      { type: "PICKUP", details: {} },
      { type: "COURIER", details: { estimatedCost: "5.00" } },
    ],
    pickupPoints: [{ key: "punto-demo", label: `Punto Demo ${label}` }],
    categories: [{ key: "general", name: "General" }],
    products: [
      {
        key: "unlimited",
        name: `Producto Demo Ilimitado (${label})`,
        description: "Stock ilimitado / hecho a pedido.",
        price: "20.00",
        status: "PUBLISHED",
        categoryKeys: ["general"],
        variants: [{ key: "default", name: "Estándar", stock: null }],
      },
      {
        key: "low-stock",
        name: `Producto Demo Stock Bajo (${label})`,
        description: "Queda solo una unidad.",
        price: "15.00",
        status: "PUBLISHED",
        categoryKeys: ["general"],
        variants: [{ key: "default", name: "Estándar", stock: 1 }],
      },
      {
        key: "sold-out",
        name: `Producto Demo Agotado (${label})`,
        description: "Sin stock disponible.",
        price: "18.00",
        status: "PUBLISHED",
        categoryKeys: ["general"],
        variants: [{ key: "default", name: "Estándar", stock: 0 }],
      },
    ],
    collections: [
      {
        key: "catalogo",
        name: "Catálogo",
        slug: "catalogo",
        description: "Catálogo demo.",
        productKeys: ["unlimited", "low-stock", "sold-out"],
      },
    ],
    sections: [
      {
        key: "catalogo",
        type: "COLLECTION",
        collectionKey: "catalogo",
        content: { title: "Catálogo" },
        position: 0,
      },
      {
        key: "banner",
        type: "BANNER",
        content: {
          imageUrl: "https://placehold.co/1200x400?text=Demo",
          headline: "Demo store",
        },
        position: 1,
      },
    ],
    customers: [
      {
        key: "buyer",
        phone: "+51944444444",
        email: `seed-buyer-${safeLabel}@example.com`,
        name: `Demo Buyer ${label}`,
        emailVerified: true,
      },
    ],
    orders: [
      {
        key: "pending",
        customerPhone: "+51933333333",
        deliveryMethodType: "PICKUP",
        pickupPointKey: "punto-demo",
        paymentStatus: "PENDING_PAYMENT",
        fulfillmentStatus: "ORDERING",
        items: [{
          productKey: "unlimited",
          variantKey: "default",
          quantity: 1,
        }],
      },
      {
        key: "verified-completed",
        customerPhone: "+51944444444",
        customerEmail: `seed-buyer-${safeLabel}@example.com`,
        customerKey: "buyer",
        deliveryMethodType: "COURIER",
        paymentStatus: "VERIFIED",
        fulfillmentStatus: "COMPLETED",
        items: [{
          productKey: "low-stock",
          variantKey: "default",
          quantity: 1,
        }],
        payments: [{
          key: "full",
          amount: "20.00",
          method: "TRANSFER",
          note: "Pago completo",
        }],
        createdDaysAgo: 2,
      },
    ],
  };
}

// Platform-level — not scoped to a store, matches ContactInquiry's schema
// (no storeId). Seeded so the admin inquiries dashboard has data to show.
export function buildContactInquiries(): ContactInquirySpec[] {
  return [
    {
      key: "demo-1",
      name: "Valeria Seed",
      email: "seed-valeria@example.com",
      company: "Valeria Merch",
      inquiryType: "general",
      message: "Hola, quisiera saber cómo crear mi tienda en Bias Market.",
    },
    {
      key: "demo-2",
      name: "Marco Seed",
      email: "seed-marco@example.com",
      inquiryType: "support",
      message: "Tengo un problema para configurar mis métodos de entrega.",
    },
  ];
}
