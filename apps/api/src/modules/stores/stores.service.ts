import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@biasmarket/db';
import { PrismaService } from '../../prisma/prisma.service.js';
import { countsTowardPaid } from '../../common/payment-summary.js';
import {
  PUBLIC_STORE_HAS_LISTABLE_PRODUCT,
  PUBLIC_STORE_VISIBILITY,
} from '../../common/public-store-visibility.js';
import {
  isStoreIndexable,
  SITEMAP_INDEXABLE_STORE_WHERE,
} from '../../common/store-indexability.js';
import { slugify } from '@biasmarket/utils/strings';
import type { UpdateStoreDto } from './dto/update-store.dto.js';
import type { CreateStoreDto } from './dto/create-store.dto.js';
import type { StoreCatalogQuery } from './store-catalog-query.js';

const RESERVED_SLUGS = ['www', 'api', 'admin', 'app'];

function catalogOrder(sort: StoreCatalogQuery['sort']) {
  if (sort === 'precio_asc' || sort === 'precio_desc') {
    const direction =
      sort === 'precio_asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    return Prisma.sql`COALESCE(
      (SELECT MIN(COALESCE(v."priceOverride", p."price"))
       FROM "ProductVariant" AS v WHERE v."productId" = p."id"),
      p."price"
    ) ${direction}`;
  }
  if (sort === 'nombre_asc') return Prisma.sql`LOWER(p."name") ASC`;
  return Prisma.sql`p."createdAt" DESC`;
}

// A TEXT_BLOCK section stores `{ body: string }` in its Json `content`. Narrow
// at the read site (same convention as the storefront renderer and
// StoreSectionWithCollectionResponseDto).
function textBlockBody(content: unknown): string {
  if (content !== null && typeof content === 'object' && 'body' in content) {
    const { body } = content as { body: unknown };
    if (typeof body === 'string') return body.trim();
  }
  return '';
}

function normalizeOptionalText(value: string | null | undefined) {
  return value === undefined ? undefined : value?.trim() || null;
}

@Injectable()
export class StoresService {
  constructor(private prisma: PrismaService) {}

  async create(ownerId: string, dto: CreateStoreDto) {
    const slug = slugify(dto.slug);

    if (RESERVED_SLUGS.includes(slug)) {
      throw new BadRequestException('This slug is reserved');
    }

    const existing = await this.prisma.store.findUnique({ where: { slug } });

    if (existing) {
      throw new BadRequestException('This slug is not avaible');
    }

    return this.prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          name: dto.name,
          slug,
          ownerId,
          themeConfig: (dto.themeConfig ?? {}) as Prisma.InputJsonValue,
          paymentInstructions: '',
          whatsappNumber: dto.whatsappNumber,
          ...(dto.defaultCurrency && { defaultCurrency: dto.defaultCurrency }),
        },
      });
      await tx.deliveryMethodConfig.create({
        data: { storeId: store.id, type: 'PICKUP', enabled: true, details: {} },
      });
      await tx.paymentMethodConfig.createMany({
        data: (['YAPE', 'PLIN', 'TRANSFER', 'CASH'] as const).map((method) => ({
          storeId: store.id,
          method,
          enabled: true,
          details: {},
        })),
      });
      return store;
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.store.findMany({ where: { ownerId: userId } });
  }

  // Platform-admin view — deliberately unfiltered by ownership, same
  // documented exception as ContactInquiry (see docs/core/admin.md).
  async findAllForAdmin() {
    return this.prisma.store.findMany({
      include: { owner: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Throws if the store does not exist or `userId` is not its owner. For
  // endpoints that act on a store without going through `update()` (e.g. the
  // multipart content-image upload) — the ownership gate must run before any
  // side effect.
  async assertOwnership(storeId: string, userId: string): Promise<void> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Store no encontrada');
    if (store.ownerId !== userId) {
      throw new ForbiddenException('No sos dueño de esta store');
    }
  }

  async update(storeId: string, userId: string, dto: UpdateStoreDto) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Store no encontrada');
    if (store.ownerId !== userId) {
      throw new ForbiddenException('No sos dueño de esta store');
    }
    const {
      themeConfig,
      instagramUrl,
      facebookUrl,
      tiktokUrl,
      twitterUrl,
      locationLabel: rawLocationLabel,
      publicOwnerName: rawPublicOwnerName,
      ...rest
    } = dto;
    const locationLabel = normalizeOptionalText(rawLocationLabel);
    const publicOwnerName = normalizeOptionalText(rawPublicOwnerName);
    // Seller-authored storefront copy changed → move the sitemap's per-store
    // `lastModified` (D4). Compare against the loaded row so a no-op save
    // (settings form re-submitted unchanged) doesn't bump it.
    const contentChanged =
      (dto.bio !== undefined && dto.bio !== store.bio) ||
      (dto.aboutMarkdown !== undefined &&
        dto.aboutMarkdown !== store.aboutMarkdown) ||
      (locationLabel !== undefined && locationLabel !== store.locationLabel) ||
      (publicOwnerName !== undefined &&
        publicOwnerName !== store.publicOwnerName);
    return this.prisma.store.update({
      where: { id: storeId },
      data: {
        ...rest,
        ...(contentChanged && { contentStaleAt: new Date() }),
        ...(instagramUrl !== undefined && {
          instagramUrl: instagramUrl || null,
        }),
        ...(facebookUrl !== undefined && {
          facebookUrl: facebookUrl || null,
        }),
        ...(tiktokUrl !== undefined && {
          tiktokUrl: tiktokUrl || null,
        }),
        ...(twitterUrl !== undefined && {
          twitterUrl: twitterUrl || null,
        }),
        ...(locationLabel !== undefined && { locationLabel }),
        ...(publicOwnerName !== undefined && { publicOwnerName }),
        ...(themeConfig !== undefined && {
          themeConfig: themeConfig as Prisma.InputJsonValue,
        }),
      },
    });
  }

  async delete(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) throw new NotFoundException('Store no encontrada');
    if (store.ownerId !== userId) {
      throw new ForbiddenException('No eres dueño de esta store');
    }
    try {
      return await this.prisma.store.delete({ where: { id: storeId } });
    } catch {
      throw new BadRequestException(
        'No se puede eliminar: la tienda tiene productos u órdenes asociadas',
      );
    }
  }

  async findBySlugForOwner(slug: string, userId: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException('Store no encontrada');
    if (store.ownerId !== userId) {
      throw new ForbiddenException('No sos dueño de esta store');
    }
    return store;
  }

  async findAllPublic() {
    return this.prisma.store.findMany({
      where: { ...PUBLIC_STORE_VISIBILITY },
      select: { slug: true, createdAt: true },
    });
  }

  async findPublicSitemapCount() {
    return this.prisma.store.count({
      where: { ...PUBLIC_STORE_VISIBILITY, ...SITEMAP_INDEXABLE_STORE_WHERE },
    });
  }

  async findPublicSitemapPage(limit: number, offset: number) {
    // D7 — thin-content gate: only stores that clear the indexability bar
    // (non-banned owner, >= MIN_INDEXABLE_PRODUCTS published products, some
    // prose) are sitemap-listed. See SITEMAP_INDEXABLE_STORE_WHERE for why this
    // filter is loose and the per-page `indexable` check is authoritative.
    const where = {
      ...PUBLIC_STORE_VISIBILITY,
      ...SITEMAP_INDEXABLE_STORE_WHERE,
    };
    const [rows, total] = await Promise.all([
      this.prisma.store.findMany({
        where,
        select: { slug: true, contentStaleAt: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.store.count({ where }),
    ]);

    // `contentStaleAt` is null until the store's first storefront-visible edit
    // (D4 added no data backfill) — fall back to `createdAt`.
    const items = rows.map((row) => ({
      slug: row.slug,
      lastModified: (row.contentStaleAt ?? row.createdAt).toISOString(),
    }));

    return { items, total };
  }

  // v1 ranking: minimum order-count floor (>=3 VERIFIED orders in the
  // trailing 30-day window) before ranking by revenue within that eligible
  // set, tie-broken by order count — plain revenue-only ranking would let a
  // single large sale outrank many smaller repeat-sale stores with no
  // tie-break. Computed at request time, same as every other aggregate in
  // this batch — revisit with a rollup table only if this becomes a real
  // load concern.
  async findFeatured(limit: number) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const MIN_ORDER_COUNT = 3;

    const candidates = await this.prisma.store.findMany({
      where: {
        ...PUBLIC_STORE_VISIBILITY,
        ...PUBLIC_STORE_HAS_LISTABLE_PRODUCT,
      },
      select: { id: true, name: true, slug: true, logoUrl: true },
    });
    if (candidates.length === 0) return [];

    const orders = await this.prisma.order.findMany({
      where: {
        storeId: { in: candidates.map((c) => c.id) },
        paymentStatus: 'VERIFIED',
        createdAt: { gte: since },
      },
      select: {
        storeId: true,
        payments: {
          select: { amount: true, source: true, reviewStatus: true },
        },
      },
    });

    const revenueByStore = new Map<string, number>();
    const orderCountByStore = new Map<string, number>();
    for (const order of orders) {
      // A VERIFIED order can still carry a buyer-submitted proof pending
      // review (e.g. re-submitted after the seller already recorded the
      // balance manually) — exclude it, same as every other revenue
      // aggregate. See common/payment-summary.ts's `countsTowardPaid`.
      const revenue = order.payments
        .filter(countsTowardPaid)
        .reduce((sum, p) => sum + Number(p.amount), 0);
      revenueByStore.set(
        order.storeId,
        (revenueByStore.get(order.storeId) ?? 0) + revenue,
      );
      orderCountByStore.set(
        order.storeId,
        (orderCountByStore.get(order.storeId) ?? 0) + 1,
      );
    }

    return candidates
      .map((store) => ({
        ...store,
        revenue: revenueByStore.get(store.id) ?? 0,
        orderCount: orderCountByStore.get(store.id) ?? 0,
      }))
      .filter((store) => store.orderCount >= MIN_ORDER_COUNT)
      .sort((a, b) => b.revenue - a.revenue || b.orderCount - a.orderCount)
      .slice(0, limit);
  }

  async findDirectory(page: number, limit: number, q: string | undefined) {
    const where: Prisma.StoreWhereInput = {
      ...PUBLIC_STORE_VISIBILITY,
      ...PUBLIC_STORE_HAS_LISTABLE_PRODUCT,
      ...(q && { name: { contains: q, mode: 'insensitive' as const } }),
    };

    const [stores, total] = await Promise.all([
      this.prisma.store.findMany({
        where,
        select: { id: true, name: true, slug: true, logoUrl: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.store.count({ where }),
    ]);

    return { stores, total, page, limit };
  }

  async findPublicBySlug(slug: string) {
    const row = await this.prisma.store.findUnique({
      where: { slug },
      // `owner.banned` feeds the D5 indexability predicate below; strip it from
      // the returned shape so it never reaches the public DTO.
      include: { owner: { select: { banned: true } } },
    });
    if (!row) throw new NotFoundException('Tienda no encontrada');
    const { owner, ...store } = row;

    const rawSections = await this.prisma.storeSection.findMany({
      where: { storeId: store.id, hidden: false },
      orderBy: { position: 'asc' },
      include: {
        collection: {
          include: {
            products: {
              orderBy: { position: 'asc' },
              include: {
                product: {
                  include: {
                    variants: true,
                    categories: {
                      include: {
                        category: {
                          select: { id: true, name: true, slug: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Filter out unpublished/deleted products after the fetch — Prisma
    // relation-filter-in-include semantics for nested to-many-through-join
    // reads are easy to get subtly wrong, application-level filtering isn't.
    const sections = rawSections.map((section) => ({
      ...section,
      collection: section.collection && {
        ...section.collection,
        products: section.collection.products.filter(
          (cp) =>
            cp.product.status === 'PUBLISHED' &&
            cp.product.deletedAt === null &&
            cp.product.discontinued === false,
        ),
      },
    }));

    // A product only shows up if it's attached to a collection wired into
    // one of the sections above — that's a manual curation step, separate
    // from creating/publishing a product. Any published product a seller
    // never got around to adding to a collection would otherwise be
    // invisible forever, so always append a catch-all trailing section for
    // whatever's left over (this also replaces the old "zero sections"
    // fallback — that's just the case where every product is left over).
    const coveredProductIds = sections.flatMap(
      (section) => section.collection?.products.map((cp) => cp.productId) ?? [],
    );
    const orphanProducts = await this.prisma.product.findMany({
      where: {
        storeId: store.id,
        status: 'PUBLISHED',
        deletedAt: null,
        discontinued: false,
        id: { notIn: coveredProductIds },
      },
      include: {
        variants: true,
        categories: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    if (orphanProducts.length > 0) {
      sections.push({
        id: 'default',
        storeId: store.id,
        type: 'COLLECTION' as const,
        collectionId: null,
        content: {},
        position: sections.length,
        hidden: false,
        createdAt: new Date(),
        collection: {
          id: null as unknown as string,
          storeId: store.id,
          name: '',
          slug: '',
          description: '',
          createdAt: new Date(),
          products: orphanProducts.map((product, position) => ({
            collectionId: null as unknown as string,
            productId: product.id,
            position,
            product,
          })),
        },
      });
    }

    // D5 (report-only): compute `isStoreIndexable` and expose it on the public
    // DTO. Nothing acts on it yet — D6 turns it into page `noindex`, D7 into a
    // sitemap filter. `hasRealTextBlockSection` is checked here (not in the
    // sitemap `where`) because this read already loads section bodies.
    const hasRealTextBlockSection = rawSections.some(
      (section) =>
        section.type === 'TEXT_BLOCK' && textBlockBody(section.content) !== '',
    );
    const indexable = isStoreIndexable({
      isPublic: store.isPublic,
      isDemo: store.isDemo,
      ownerBanned: owner?.banned === true,
      publishedProductCount: store.publishedProductCount,
      bio: store.bio,
      aboutMarkdown: store.aboutMarkdown,
      hasRealTextBlockSection,
    });

    return { ...store, sections, indexable };
  }

  async findCollectionsPublic() {
    const collections = await this.prisma.collection.findMany({
      where: { store: { ...PUBLIC_STORE_VISIBILITY } },
      include: {
        store: { select: { slug: true } },
        products: {
          include: {
            product: {
              select: { status: true, deletedAt: true, discontinued: true },
            },
          },
        },
      },
    });
    return collections
      .filter((c) =>
        c.products.some(
          (cp) =>
            cp.product.status === 'PUBLISHED' &&
            cp.product.deletedAt === null &&
            cp.product.discontinued === false,
        ),
      )
      .map((c) => ({
        storeSlug: c.store.slug,
        collectionSlug: c.slug,
        createdAt: c.createdAt,
      }));
  }

  async findPublicCatalog(slug: string, query: StoreCatalogQuery) {
    const store = await this.prisma.store.findFirst({
      where: {
        slug,
      },
      select: { id: true },
    });
    if (!store) throw new NotFoundException('Tienda no encontrada');

    const normalizedQuery = query.q
      ?.normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
    const escapedQuery = normalizedQuery?.replace(/[\\%_]/g, '\\$&');
    const searchFilter = escapedQuery
      ? Prisma.sql`AND TRANSLATE(LOWER(CONCAT_WS(' ', p."name", p."description")), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc') LIKE ${`%${escapedQuery}%`} ESCAPE '\\'`
      : Prisma.empty;
    const categoryFilter = query.categories.length
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM "ProductCategory" AS pc
          JOIN "Category" AS c ON c."id" = pc."categoryId"
          WHERE pc."productId" = p."id"
            AND c."storeId" = p."storeId"
            AND c."slug" IN (${Prisma.join(query.categories)})
        )`
      : Prisma.empty;
    const filters = Prisma.sql`
      p."storeId" = ${store.id}
      AND p."status" = 'PUBLISHED'
      AND p."deletedAt" IS NULL
      AND p."discontinued" = false
      ${searchFilter}
      ${categoryFilter}
    `;
    const [countRows, idRows] = await Promise.all([
      this.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total FROM "Product" AS p WHERE ${filters}
      `),
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT p."id" FROM "Product" AS p WHERE ${filters}
        ORDER BY ${catalogOrder(query.sort)}, p."id" ASC
        OFFSET ${(query.page - 1) * query.limit} LIMIT ${query.limit}
      `),
    ]);
    const ids = idRows.map(({ id }) => id);
    const products = ids.length
      ? await this.prisma.product.findMany({
          where: {
            id: { in: ids },
            storeId: store.id,
            status: 'PUBLISHED',
            deletedAt: null,
            discontinued: false,
          },
          include: {
            variants: true,
            categories: {
              include: {
                category: { select: { id: true, name: true, slug: true } },
              },
            },
          },
        })
      : [];
    const byId = new Map(products.map((product) => [product.id, product]));
    return {
      items: ids.flatMap((id) => {
        const product = byId.get(id);
        return product ? [product] : [];
      }),
      total: Number(countRows[0]?.total ?? 0),
      page: query.page,
      limit: query.limit,
    };
  }

  async findCategoriesPublic(slug: string) {
    const store = await this.prisma.store.findFirst({
      where: {
        slug,
      },
      select: { id: true },
    });
    if (!store) throw new NotFoundException('Tienda no encontrada');
    const categories = await this.prisma.category.findMany({
      where: { storeId: store.id },
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        _count: {
          select: {
            products: {
              where: {
                product: {
                  status: 'PUBLISHED',
                  deletedAt: null,
                  discontinued: false,
                  storeId: store.id,
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    return categories.map(({ _count, ...category }) => ({
      ...category,
      productCount: _count.products,
    }));
  }

  async findPublicProduct(slug: string, productId: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException('Tienda no encontrada');

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        variants: true,
        categories: {
          include: {
            category: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
    if (
      !product ||
      product.storeId !== store.id ||
      product.status !== 'PUBLISHED' ||
      product.deletedAt !== null ||
      product.discontinued
    ) {
      throw new NotFoundException('Producto no encontrado');
    }

    return {
      store: { name: store.name, slug: store.slug, logoUrl: store.logoUrl },
      product,
    };
  }

  async updateLogo(storeId: string, userId: string, url: string) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.store.update({
      where: { id: storeId },
      data: { logoUrl: url },
    });
  }

  async updatePublicHeaderImage(
    storeId: string,
    userId: string,
    field: 'bannerUrl' | 'publicOwnerAvatarUrl',
    url: string,
  ) {
    await this.assertOwnership(storeId, userId);
    return this.prisma.store.update({
      where: { id: storeId },
      data: { [field]: url, contentStaleAt: new Date() },
    });
  }
}
