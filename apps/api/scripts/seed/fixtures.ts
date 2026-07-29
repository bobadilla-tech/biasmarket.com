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
  status: 'DRAFT' | 'PUBLISHED';
  soldOut?: boolean;
  availableUntil?: Date;
  categoryKeys?: string[];
  variants?: VariantSpec[];
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
  type: 'COLLECTION' | 'BANNER' | 'TEXT_BLOCK';
  collectionKey?: string;
  content: Record<string, unknown>;
  position: number;
}

export interface OrderItemSpec {
  productKey: string;
  variantKey?: string;
  quantity: number;
}

export interface OrderSpec {
  key: string;
  customerPhone: string;
  customerName?: string;
  customerEmail?: string;
  deliveryMethodType: 'PICKUP' | 'COURIER';
  paymentStatus: 'PENDING_PAYMENT' | 'PAYMENT_SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'CANCELLED';
  fulfillmentStatus: 'ORDERING' | 'IN_TRANSIT' | 'READY' | 'COMPLETED';
  items: OrderItemSpec[];
  createdDaysAgo?: number;
}

export interface StoreFixtureSpec {
  seller: { email: string; name: string };
  store: { name: string; slug: string; whatsappNumber: string; defaultCurrency: string };
  deliveryMethods: { type: 'PICKUP' | 'COURIER'; details: Record<string, unknown> }[];
  categories: CategorySpec[];
  products: ProductSpec[];
  collections: CollectionSpec[];
  sections: SectionSpec[];
  orders: OrderSpec[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const pastDate = () => new Date(Date.now() - 10 * DAY_MS);
const futureDate = () => new Date(Date.now() + 90 * DAY_MS);

function camilaStore(): StoreFixtureSpec {
  return {
    seller: { email: 'seed-seller1@biasmarket.dev', name: 'Camila Seller' },
    store: {
      name: 'Tienda de Camila',
      slug: 'demo-tienda-de-camila',
      whatsappNumber: '+51987654321',
      defaultCurrency: 'PEN',
    },
    deliveryMethods: [
      { type: 'PICKUP', details: {} },
      { type: 'COURIER', details: { estimatedCost: '8.00' } },
    ],
    categories: [
      { key: 'albumes', name: 'Álbumes' },
      { key: 'albumes-photobook', name: 'Photobook Edition', parentKey: 'albumes' },
      { key: 'merch', name: 'Merch' },
    ],
    products: [
      {
        key: 'photobook',
        name: 'Álbum Photobook Edition',
        description: 'Álbum oficial con photobook de 80 páginas.',
        price: '45.00',
        status: 'PUBLISHED',
        categoryKeys: ['albumes-photobook'],
        variants: [
          { key: 'a', name: 'Versión A', stock: 5, attributes: { version: 'A' } },
          { key: 'b', name: 'Versión B', stock: 0, attributes: { version: 'B' } }, // sold out
        ],
      },
      {
        key: 'photocards',
        name: 'Photocard Set',
        description: 'Set de 5 photocards random.',
        price: '15.00',
        status: 'PUBLISHED',
        categoryKeys: ['merch'],
        // no variants = unlimited stock
      },
      {
        key: 'lightstick',
        name: 'Lightstick Oficial',
        description: 'Lightstick con bluetooth, edición actual.',
        price: '60.00',
        status: 'PUBLISHED',
        categoryKeys: ['merch'],
        variants: [{ key: 'default', name: 'Estándar', stock: 1 }], // low stock
      },
      {
        key: 'keyring-draft',
        name: 'Llavero Bordado (Preview)',
        description: 'Todavía en preview, no debería verse en la tienda pública.',
        price: '8.00',
        status: 'DRAFT',
      },
      {
        key: 'poster-expired',
        name: 'Poster Edición Limitada 2025',
        description: 'Edición limitada, disponibilidad ya vencida.',
        price: '18.00',
        status: 'PUBLISHED',
        availableUntil: pastDate(),
      },
      {
        key: 'lightstick-v2',
        name: 'Lightstick Bluetooth v2',
        description: 'Nueva versión, disponible por tiempo limitado.',
        price: '65.00',
        status: 'PUBLISHED',
        availableUntil: futureDate(),
        variants: [{ key: 'std', name: 'Estándar', stock: null }], // unlimited
      },
      {
        key: 'bundle-reserved',
        name: 'Bundle Reservado Demo',
        description: 'Bundle con una unidad ya reservada por un pedido pendiente.',
        price: '30.00',
        status: 'PUBLISHED',
        variants: [{ key: 'only', name: 'Único', stock: 3, reserved: 2 }], // available = 1
      },
      {
        key: 'photocard-override',
        name: 'Photocard Premium',
        description: 'Edición gold con precio e imagen propios.',
        price: '10.00',
        status: 'PUBLISHED',
        variants: [
          {
            key: 'gold',
            name: 'Gold Edition',
            stock: 4,
            priceOverride: '14.00',
            imageOverride: 'https://placehold.co/400x400?text=Gold',
          },
        ],
      },
    ],
    collections: [
      {
        key: 'destacados',
        name: 'Destacados',
        slug: 'destacados',
        description: 'Lo más pedido.',
        productKeys: ['photobook', 'lightstick', 'bundle-reserved'],
      },
      {
        key: 'nuevos',
        name: 'Nuevos Ingresos',
        slug: 'nuevos-ingresos',
        description: 'Recién agregado al catálogo.',
        productKeys: ['lightstick-v2', 'photocard-override'],
      },
    ],
    sections: [
      { key: 'destacados', type: 'COLLECTION', collectionKey: 'destacados', content: { title: 'Destacados' }, position: 0 },
      {
        key: 'banner',
        type: 'BANNER',
        content: { imageUrl: 'https://placehold.co/1200x400?text=Bias+Market', headline: 'Envíos a todo el país' },
        position: 1,
      },
      {
        key: 'about',
        type: 'TEXT_BLOCK',
        content: { title: 'Sobre la tienda', body: 'Tienda oficial de merch, pagos por transferencia o Yape.' },
        position: 2,
      },
    ],
    orders: [
      {
        key: 'pending',
        customerPhone: '+51900000001',
        customerName: 'Ana Test',
        deliveryMethodType: 'PICKUP',
        paymentStatus: 'PENDING_PAYMENT',
        fulfillmentStatus: 'ORDERING',
        items: [{ productKey: 'photocards', quantity: 2 }],
      },
      {
        key: 'submitted',
        customerPhone: '+51900000002',
        customerEmail: 'seed-bruno@example.com',
        deliveryMethodType: 'COURIER',
        paymentStatus: 'PAYMENT_SUBMITTED',
        fulfillmentStatus: 'ORDERING',
        items: [{ productKey: 'photobook', variantKey: 'a', quantity: 1 }],
        createdDaysAgo: 1,
      },
      {
        key: 'verified-transit',
        customerPhone: '+51900000003',
        deliveryMethodType: 'COURIER',
        paymentStatus: 'VERIFIED',
        fulfillmentStatus: 'IN_TRANSIT',
        items: [{ productKey: 'lightstick', variantKey: 'default', quantity: 1 }],
        createdDaysAgo: 3,
      },
      {
        key: 'verified-completed',
        customerPhone: '+51900000004',
        deliveryMethodType: 'PICKUP',
        paymentStatus: 'VERIFIED',
        fulfillmentStatus: 'COMPLETED',
        items: [{ productKey: 'lightstick-v2', variantKey: 'std', quantity: 2 }],
        createdDaysAgo: 7,
      },
      {
        key: 'rejected',
        customerPhone: '+51900000005',
        deliveryMethodType: 'PICKUP',
        paymentStatus: 'REJECTED',
        fulfillmentStatus: 'ORDERING',
        items: [{ productKey: 'photocard-override', variantKey: 'gold', quantity: 1 }],
        createdDaysAgo: 2,
      },
      {
        key: 'cancelled',
        customerPhone: '+51900000006',
        deliveryMethodType: 'COURIER',
        paymentStatus: 'CANCELLED',
        fulfillmentStatus: 'ORDERING',
        items: [{ productKey: 'bundle-reserved', variantKey: 'only', quantity: 1 }],
        createdDaysAgo: 4,
      },
    ],
  };
}

function kpopCornerStore(): StoreFixtureSpec {
  return {
    seller: { email: 'seed-seller2@biasmarket.dev', name: 'K-Pop Corner' },
    store: {
      name: 'K-Pop Corner',
      slug: 'demo-kpop-corner',
      whatsappNumber: '+51912345678',
      defaultCurrency: 'PEN',
    },
    deliveryMethods: [
      { type: 'PICKUP', details: {} },
      { type: 'COURIER', details: { estimatedCost: '10.00' } },
    ],
    categories: [
      { key: 'posters', name: 'Posters' },
      { key: 'photocards', name: 'Photocards' },
    ],
    products: [
      {
        key: 'poster',
        name: 'Poster Oficial',
        description: 'Poster A2 enrollado, envío protegido.',
        price: '20.00',
        status: 'PUBLISHED',
        categoryKeys: ['posters'],
      },
      {
        key: 'member-set',
        name: 'Photocard Member Set',
        description: 'Photocard random por miembro.',
        price: '12.00',
        status: 'PUBLISHED',
        categoryKeys: ['photocards'],
        variants: [
          { key: 'jk', name: 'Jungkook', stock: 2, attributes: { member: 'Jungkook' } },
          { key: 'v', name: 'V', stock: 0, attributes: { member: 'V' } }, // sold out
        ],
      },
      {
        key: 'bundle',
        name: 'Merch Bundle',
        description: 'Bundle con llavero + sticker pack.',
        price: '25.00',
        status: 'PUBLISHED',
        variants: [{ key: 'only', name: 'Único', stock: null }],
      },
    ],
    collections: [
      {
        key: 'catalogo',
        name: 'Todo el Catálogo',
        slug: 'catalogo',
        description: 'Todos los productos disponibles.',
        productKeys: ['poster', 'member-set', 'bundle'],
      },
    ],
    sections: [
      { key: 'catalogo', type: 'COLLECTION', collectionKey: 'catalogo', content: { title: 'Catálogo' }, position: 0 },
      {
        key: 'banner',
        type: 'BANNER',
        content: { imageUrl: 'https://placehold.co/1200x400?text=K-Pop+Corner', headline: 'Nuevo stock cada semana' },
        position: 1,
      },
    ],
    orders: [
      {
        key: 'pending',
        customerPhone: '+51911111111',
        deliveryMethodType: 'PICKUP',
        paymentStatus: 'PENDING_PAYMENT',
        fulfillmentStatus: 'ORDERING',
        items: [{ productKey: 'poster', quantity: 1 }],
      },
      {
        key: 'verified-completed',
        customerPhone: '+51922222222',
        customerName: 'Bruno Test',
        deliveryMethodType: 'COURIER',
        paymentStatus: 'VERIFIED',
        fulfillmentStatus: 'COMPLETED',
        items: [{ productKey: 'member-set', variantKey: 'jk', quantity: 1 }],
        createdDaysAgo: 5,
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
      { email: 'admin@biasmarket.dev', name: 'Dev Admin' },
      { email: 'owner@biasmarket.dev', name: 'Dev Owner' },
    ],
    stores: [camilaStore(), kpopCornerStore()],
  };
}

export function buildAppendFixture(label: string): StoreFixtureSpec {
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  return {
    seller: { email: `seed-seller-${safeLabel}@biasmarket.dev`, name: `Demo Seller ${label}` },
    store: {
      name: `Demo Store ${label}`,
      slug: `demo-${safeLabel}`,
      whatsappNumber: '+51900000000',
      defaultCurrency: 'PEN',
    },
    deliveryMethods: [
      { type: 'PICKUP', details: {} },
      { type: 'COURIER', details: { estimatedCost: '5.00' } },
    ],
    categories: [{ key: 'general', name: 'General' }],
    products: [
      {
        key: 'unlimited',
        name: `Producto Demo Ilimitado (${label})`,
        description: 'Stock ilimitado / hecho a pedido.',
        price: '20.00',
        status: 'PUBLISHED',
        categoryKeys: ['general'],
        variants: [{ key: 'default', name: 'Estándar', stock: null }],
      },
      {
        key: 'low-stock',
        name: `Producto Demo Stock Bajo (${label})`,
        description: 'Queda solo una unidad.',
        price: '15.00',
        status: 'PUBLISHED',
        categoryKeys: ['general'],
        variants: [{ key: 'default', name: 'Estándar', stock: 1 }],
      },
      {
        key: 'sold-out',
        name: `Producto Demo Agotado (${label})`,
        description: 'Sin stock disponible.',
        price: '18.00',
        status: 'PUBLISHED',
        categoryKeys: ['general'],
        variants: [{ key: 'default', name: 'Estándar', stock: 0 }],
      },
    ],
    collections: [
      {
        key: 'catalogo',
        name: 'Catálogo',
        slug: 'catalogo',
        description: 'Catálogo demo.',
        productKeys: ['unlimited', 'low-stock', 'sold-out'],
      },
    ],
    sections: [
      { key: 'catalogo', type: 'COLLECTION', collectionKey: 'catalogo', content: { title: 'Catálogo' }, position: 0 },
      { key: 'banner', type: 'BANNER', content: { imageUrl: 'https://placehold.co/1200x400?text=Demo', headline: 'Demo store' }, position: 1 },
    ],
    orders: [
      {
        key: 'pending',
        customerPhone: '+51933333333',
        deliveryMethodType: 'PICKUP',
        paymentStatus: 'PENDING_PAYMENT',
        fulfillmentStatus: 'ORDERING',
        items: [{ productKey: 'unlimited', variantKey: 'default', quantity: 1 }],
      },
      {
        key: 'verified-completed',
        customerPhone: '+51944444444',
        deliveryMethodType: 'COURIER',
        paymentStatus: 'VERIFIED',
        fulfillmentStatus: 'COMPLETED',
        items: [{ productKey: 'low-stock', variantKey: 'default', quantity: 1 }],
        createdDaysAgo: 2,
      },
    ],
  };
}
