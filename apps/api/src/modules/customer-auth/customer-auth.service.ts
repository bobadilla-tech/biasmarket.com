import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@biasmarket/db';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import {
  createCustomerSessionToken,
  verifyCustomerAccountToken,
} from '@biasmarket/utils/customer-account-token';
import { normalizePhone } from '@biasmarket/utils/phone-country';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CustomerAccountService } from '../orders/application/customer-account.service.js';
import { OrderRepository } from '../orders/infrastructure/order.repository.js';
import { OrderEventsService } from '../orders/application/order-events.service.js';
import { toPublicTimeline } from '../orders/application/public-order-timeline.js';
import { countsTowardPaid } from '../../common/payment-summary.js';
import { linkFingerprint, type ClaimTicket } from './claim-ticket.js';
import { requiredEnv } from '../../config/env.validation.js';
import { withPaymentSummary } from '../../common/payment-summary.js';
import { toAccountOrderDto } from './dto/account-order-response.dto.js';
import type { GlobalAccountOrderDetailResponseDto } from './dto/global-account-response.dto.js';

export type ClaimFailureCode = 'already_claimed' | 'not_claimable' | 'invalid';

// Why a claim was refused. The callback maps the code to a redirect; nothing
// here carries the order token, email or ticket.
export class ClaimOrderError extends Error {
  constructor(readonly code: ClaimFailureCode) {
    super(`claim refused: ${code}`);
    this.name = 'ClaimOrderError';
  }
}

@Injectable()
export class CustomerAuthService {
  private readonly logger = new Logger(CustomerAuthService.name);

  constructor(
    private prisma: PrismaService,
    private customerAccount: CustomerAccountService,
    private orderRepository: OrderRepository,
    private events: OrderEventsService,
  ) {}

  private async findStoreBySlug(slug: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException('Store no encontrada');
    return store;
  }

  async assertStoreExists(slug: string): Promise<void> {
    await this.findStoreBySlug(slug);
  }

  private issueSessionToken(
    buyerAccountId: string,
    passwordVersion: number,
  ): string {
    const secret = requiredEnv('CUSTOMER_ACCOUNT_TOKEN_SECRET');
    return createCustomerSessionToken(buyerAccountId, passwordVersion, secret);
  }

  // Any known buyer becomes "linked" to any store they successfully
  // register/log in/check out at — no confirmation step, matches the
  // low-friction framing in the plan doc. Idempotent: a link that already
  // exists is a silent no-op.
  private async ensureStoreLink(
    buyerAccountId: string,
    storeId: string,
  ): Promise<void> {
    await this.prisma.customerStoreLink.upsert({
      where: { buyerAccountId_storeId: { buyerAccountId, storeId } },
      create: { buyerAccountId, storeId },
      update: {},
    });
  }

  async register(
    slug: string,
    token: string,
    password: string,
  ): Promise<{ ok: true }> {
    await this.findStoreBySlug(slug);
    return this.setPasswordFromToken(token, password);
  }

  // Global (no-store) counterpart of `register` — the emailed token already
  // identifies the buyer account, so no store is needed to redeem it.
  resetPasswordGlobal(token: string, password: string): Promise<{ ok: true }> {
    return this.setPasswordFromToken(token, password);
  }

  private async setPasswordFromToken(
    token: string,
    password: string,
  ): Promise<{ ok: true }> {
    const secret = requiredEnv('CUSTOMER_ACCOUNT_TOKEN_SECRET');
    const verified = verifyCustomerAccountToken(token, secret);
    if (
      !verified ||
      (verified.purpose !== 'confirm' && verified.purpose !== 'reset')
    ) {
      throw new BadRequestException('Enlace inválido o expirado');
    }

    const buyerAccount = await this.prisma.buyerAccount.findUnique({
      where: { id: verified.buyerAccountId },
    });
    if (!buyerAccount) {
      throw new BadRequestException('Enlace inválido o expirado');
    }

    // The magic-link token itself is the "verified proof of email ownership"
    // this endpoint requires — it's not single-use by itself (a stateless
    // HMAC token, replayable within its own TTL). Single-use for *initial
    // registration* specifically comes from this check instead: once
    // passwordHash is set, a "confirm"-purpose token can't set it again, so
    // it can't be replayed to overwrite an already-set password. A
    // "reset"-purpose token is exempt — that's the whole point of forgot
    // password — and gets a much shorter TTL to bound the risk (see
    // `ttlForPurpose` in the token util).
    if (verified.purpose === 'confirm' && buyerAccount.passwordHash) {
      throw new ConflictException(
        'Esta cuenta ya tiene una contraseña configurada',
      );
    }

    const passwordHash = await hashPassword(password);
    await this.prisma.buyerAccount.update({
      where: { id: buyerAccount.id },
      data:
        verified.purpose === 'confirm'
          ? {
              passwordHash,
              emailVerified: true,
              passwordVersion: { increment: 1 },
            }
          : { passwordHash, passwordVersion: { increment: 1 } },
    });

    return { ok: true };
  }

  async forgotPassword(slug: string, phone: string): Promise<void> {
    const store = await this.findStoreBySlug(slug);
    const buyerAccount = await this.prisma.buyerAccount.findUnique({
      where: { phone: normalizePhone(phone) },
    });

    // Always resolve — never confirm or deny whether an account exists for
    // this phone number.
    if (!buyerAccount?.passwordHash || !buyerAccount.email) return;

    await this.customerAccount.sendPasswordResetEmail(buyerAccount, store);
  }

  async forgotPasswordGlobal(phone: string): Promise<void> {
    const buyerAccount = await this.prisma.buyerAccount.findUnique({
      where: { phone: normalizePhone(phone) },
    });

    // Always resolves — never confirm or deny whether an account exists.
    if (!buyerAccount?.passwordHash || !buyerAccount.email) return;

    await this.customerAccount.sendPasswordResetEmail(buyerAccount, null);
  }

  async login(slug: string, phone: string, password: string): Promise<string> {
    const store = await this.findStoreBySlug(slug);
    const buyerAccount = await this.authenticateByPhone(phone, password);

    await this.ensureStoreLink(buyerAccount.id, store.id);

    return this.issueSessionToken(
      buyerAccount.id,
      buyerAccount.passwordVersion,
    );
  }

  // Global (no-store) login — same credentials, no store link to create.
  async loginGlobal(phone: string, password: string): Promise<string> {
    const buyerAccount = await this.authenticateByPhone(phone, password);
    return this.issueSessionToken(
      buyerAccount.id,
      buyerAccount.passwordVersion,
    );
  }

  private async authenticateByPhone(phone: string, password: string) {
    const buyerAccount = await this.prisma.buyerAccount.findUnique({
      where: { phone: normalizePhone(phone) },
    });

    // Same generic error whether the phone doesn't exist or the password is
    // wrong — never leak which one it was.
    if (!buyerAccount?.passwordHash) {
      throw new UnauthorizedException('Teléfono o contraseña inválidos');
    }

    const valid = await verifyPassword({
      hash: buyerAccount.passwordHash,
      password,
    });
    if (!valid) {
      throw new UnauthorizedException('Teléfono o contraseña inválidos');
    }

    return buyerAccount;
  }

  // Google proves ownership of an email, not a phone number, and an email
  // alone is not a safe key to merge accounts on: a checkout can create a
  // phone account carrying someone else's email, and a victim who then
  // confirms that email would hand their Google login to an account the
  // attacker shaped. So Google never links by email. Resolution: (1) the
  // account already bound to this Google `sub`; (2) otherwise a new phone-less,
  // Google-verified account. A buyer who bought with their phone signs in with
  // their phone to see those orders (the web shows a hint).
  // Runs on its own statements (no surrounding transaction) because a P2002
  // aborts a Postgres transaction and could not be recovered from.
  // `slug` is null for the global (no-store) entry point.
  async loginWithGoogle(
    slug: string | null,
    identity: { sub: string; email: string; name: string | null },
  ): Promise<string> {
    const store = slug ? await this.findStoreBySlug(slug) : null;
    const buyerAccount = await this.resolveGoogleAccount(identity);

    if (store) await this.ensureStoreLink(buyerAccount.id, store.id);

    return this.issueSessionToken(
      buyerAccount.id,
      buyerAccount.passwordVersion,
    );
  }

  // Saves a vendor-assisted order to the Google account behind `identity`.
  // The account is resolved first and OUTSIDE the transaction (a P2002 would
  // abort it); only the order claim is transactional. The order row is locked
  // so a concurrent void or a second claim serializes against this one, and
  // the conditional `updateMany` is the real guard: exactly one claimer wins.
  // A repeat claim by the same account succeeds without a second event.
  // Never touches `BuyerAccount.phone` or `Order.phoneVerified`.
  async claimWithGoogle(
    identity: { sub: string; email: string; name: string | null },
    ticket: Pick<ClaimTicket, 'orderId' | 'linkFp' | 'moment'>,
  ): Promise<{ token: string; orderId: string }> {
    const account = await this.resolveGoogleAccount(identity);

    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Order" WHERE id = ${ticket.orderId} FOR UPDATE
      `;
      if (!locked.length) throw new ClaimOrderError('invalid');

      const select = {
        id: true,
        storeId: true,
        source: true,
        status: true,
        paymentStatus: true,
        claimedAt: true,
        buyerAccountId: true,
        accessTokenHash: true,
        accessTokenRevokedAt: true,
        payments: {
          select: {
            amount: true,
            source: true,
            reviewStatus: true,
            voidedAt: true,
          },
        },
      } as const;
      const order = await tx.order.findFirst({
        where: { id: ticket.orderId },
        select,
      });
      if (!order) throw new ClaimOrderError('invalid');

      if (order.claimedAt || order.buyerAccountId) {
        // Same account re-claiming is a success; anyone else is too late.
        if (order.buyerAccountId === account.id) {
          await this.upsertStoreLink(tx, account.id, order.storeId);
          return;
        }
        throw new ClaimOrderError('already_claimed');
      }
      if (
        order.accessTokenRevokedAt ||
        !order.accessTokenHash ||
        linkFingerprint(order.accessTokenHash) !== ticket.linkFp
      ) {
        throw new ClaimOrderError('invalid');
      }
      if (
        order.source !== 'VENDOR_ASSISTED' ||
        order.status === 'CANCELLED' ||
        order.paymentStatus === 'CANCELLED' ||
        !order.payments.some(countsTowardPaid)
      ) {
        throw new ClaimOrderError('not_claimable');
      }

      const { count } = await tx.order.updateMany({
        where: {
          id: order.id,
          source: 'VENDOR_ASSISTED',
          status: { not: 'CANCELLED' },
          paymentStatus: { not: 'CANCELLED' },
          claimedAt: null,
          buyerAccountId: null,
          accessTokenRevokedAt: null,
          accessTokenHash: { startsWith: ticket.linkFp },
        },
        data: { buyerAccountId: account.id, claimedAt: new Date() },
      });
      if (count !== 1) throw new ClaimOrderError('already_claimed');

      await this.upsertStoreLink(tx, account.id, order.storeId);
      await this.events.record(tx, {
        orderId: order.id,
        storeId: order.storeId,
        type: 'CLAIMED',
        actor: 'BUYER',
        payload: ticket.moment ? { moment: ticket.moment } : {},
      });
    });

    return {
      token: this.issueSessionToken(account.id, account.passwordVersion),
      orderId: ticket.orderId,
    };
  }

  private upsertStoreLink(
    client: Prisma.TransactionClient,
    buyerAccountId: string,
    storeId: string,
  ) {
    return client.customerStoreLink.upsert({
      where: { buyerAccountId_storeId: { buyerAccountId, storeId } },
      create: { buyerAccountId, storeId },
      update: {},
    });
  }

  private async resolveGoogleAccount(identity: {
    sub: string;
    email: string;
    name: string | null;
  }): Promise<{ id: string; passwordVersion: number }> {
    const bySub = await this.prisma.buyerAccount.findUnique({
      where: { googleSub: identity.sub },
    });
    if (bySub) return bySub;

    let created: { id: string; passwordVersion: number };
    try {
      created = await this.prisma.buyerAccount.create({
        data: {
          email: identity.email,
          emailVerified: true,
          name: identity.name,
          googleSub: identity.sub,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // A concurrent first login with this `sub` won the race: sign in.
        const winner = await this.prisma.buyerAccount.findUnique({
          where: { googleSub: identity.sub },
        });
        if (winner) return winner;
      }
      throw err;
    }

    await this.logSkippedEmailLink(created.id, identity.email);
    return created;
  }

  // Support breadcrumb for "I signed in with Google and my orders are gone":
  // another account already uses this email and was deliberately not linked.
  // Ids only, never the email or a phone. Best effort: the account exists
  // already, so a failure here must not fail the login.
  private async logSkippedEmailLink(buyerAccountId: string, email: string) {
    try {
      const existing = await this.prisma.buyerAccount.findFirst({
        where: {
          email: { equals: email, mode: 'insensitive' },
          id: { not: buyerAccountId },
        },
        select: { id: true },
      });
      if (existing) {
        this.logger.log({
          event: 'google-link-skipped',
          buyerAccountId,
          existingBuyerAccountId: existing.id,
        });
      }
    } catch {
      // Intentionally ignored: logging only.
    }
  }

  async changePassword(
    buyerAccountId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<string> {
    const buyerAccount = await this.prisma.buyerAccount.findUnique({
      where: { id: buyerAccountId },
    });
    if (!buyerAccount?.passwordHash) {
      throw new UnauthorizedException('No autenticado');
    }

    const valid = await verifyPassword({
      hash: buyerAccount.passwordHash,
      password: currentPassword,
    });
    if (!valid) throw new BadRequestException('Contraseña actual incorrecta');

    const passwordHash = await hashPassword(newPassword);
    const updated = await this.prisma.buyerAccount.update({
      where: { id: buyerAccount.id },
      data: { passwordHash, passwordVersion: { increment: 1 } },
    });

    return this.issueSessionToken(updated.id, updated.passwordVersion);
  }

  async getProfile(slug: string, session: { buyerAccountId: string }) {
    const store = await this.findStoreBySlug(slug);

    const buyerAccount = await this.prisma.buyerAccount.findUniqueOrThrow({
      where: { id: session.buyerAccountId },
    });
    const orders = await this.prisma.order.findMany({
      where: { buyerAccountId: buyerAccount.id, storeId: store.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        totalAmount: true,
        requiredAmount: true,
        currency: true,
        createdAt: true,
        source: true,
        claimedAt: true,
        payments: {
          select: {
            amount: true,
            source: true,
            reviewStatus: true,
            voidedAt: true,
          },
        },
      },
    });

    return {
      customer: {
        name: buyerAccount.name,
        email: buyerAccount.email,
        phone: buyerAccount.phone,
        emailVerified: buyerAccount.emailVerified,
        pendingEmail: buyerAccount.pendingEmail,
        pendingPhone: buyerAccount.pendingPhone,
      },
      orders: orders.map((order) =>
        toAccountOrderDto(withPaymentSummary(order)),
      ),
    };
  }

  // `findRowByIdForStore` already 404s on a wrong storeId; the buyerAccountId
  // check below covers the remaining case — a different buyer's order inside
  // the *same* store. Both cases return the same generic 404 (never a 403)
  // so a probing request can't distinguish "doesn't exist" from "not yours".
  async getOrderDetail(
    slug: string,
    session: { buyerAccountId: string },
    orderId: string,
  ) {
    const store = await this.findStoreBySlug(slug);
    const row = await this.orderRepository.findRowByIdForStore(
      orderId,
      store.id,
    );
    if (row.buyerAccountId !== session.buyerAccountId) {
      throw new NotFoundException('Orden no encontrada');
    }
    return row;
  }

  async updateProfile(
    slug: string,
    session: { buyerAccountId: string },
    dto: { name: string; email?: string; phone?: string },
  ) {
    const store = await this.findStoreBySlug(slug);

    const buyerAccount = await this.prisma.buyerAccount.findUniqueOrThrow({
      where: { id: session.buyerAccountId },
    });

    const data: { name: string; pendingEmail?: string; pendingPhone?: string } =
      {
        name: dto.name,
      };

    let sendEmailChangeTo: string | undefined;
    let sendPhoneChange = false;

    if (dto.email && dto.email !== buyerAccount.email) {
      // Global uniqueness check — the account is no longer store-scoped, so
      // an email clash against any other `BuyerAccount` blocks the change,
      // not just one within the current store.
      const clash = await this.prisma.buyerAccount.findFirst({
        where: {
          email: dto.email,
          NOT: { id: buyerAccount.id },
        },
      });
      if (clash) throw new ConflictException('Este correo ya está en uso');

      data.pendingEmail = dto.email;
      sendEmailChangeTo = dto.email;
    }

    const normalizedPhone = dto.phone ? normalizePhone(dto.phone) : undefined;
    if (normalizedPhone && normalizedPhone !== buyerAccount.phone) {
      if (!buyerAccount.emailVerified) {
        throw new BadRequestException(
          'Verifica tu correo antes de cambiar tu teléfono',
        );
      }
      const clash = await this.prisma.buyerAccount.findUnique({
        where: { phone: normalizedPhone },
      });
      if (clash) throw new ConflictException('Este teléfono ya está en uso');

      data.pendingPhone = normalizedPhone;
      sendPhoneChange = true;
    }

    const updated = await this.prisma.buyerAccount.update({
      where: { id: buyerAccount.id },
      data,
    });

    if (sendEmailChangeTo) {
      await this.customerAccount.sendEmailChangeConfirmation(
        updated,
        store,
        sendEmailChangeTo,
      );
    }
    if (sendPhoneChange) {
      await this.customerAccount.sendPhoneChangeConfirmation(updated, store);
    }

    return {
      name: updated.name,
      pendingEmail: updated.pendingEmail,
      pendingPhone: updated.pendingPhone,
    };
  }

  // Slug-independent — the first genuinely global buyer endpoint. Returns
  // the BuyerAccount profile plus every store it's linked to.
  async getGlobalProfile(buyerAccountId: string) {
    const buyerAccount = await this.prisma.buyerAccount.findUniqueOrThrow({
      where: { id: buyerAccountId },
      include: { stores: { include: { store: true } } },
    });

    return {
      name: buyerAccount.name,
      email: buyerAccount.email,
      phone: buyerAccount.phone,
      emailVerified: buyerAccount.emailVerified,
      pendingEmail: buyerAccount.pendingEmail,
      pendingPhone: buyerAccount.pendingPhone,
      stores: buyerAccount.stores.map((link) => ({
        slug: link.store.slug,
        name: link.store.name,
      })),
    };
  }

  // Raw scan by `buyerAccountId` rather than joining through
  // `CustomerStoreLink` — an order can exist without an active link (e.g. a
  // since-removed link), and the intent here is "every order this account
  // has ever placed," not "every order at a store it's currently linked to."
  async getGlobalOrders(buyerAccountId: string) {
    const orders = await this.prisma.order.findMany({
      where: { buyerAccountId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        totalAmount: true,
        requiredAmount: true,
        currency: true,
        createdAt: true,
        source: true,
        claimedAt: true,
        store: { select: { slug: true, name: true } },
        payments: {
          select: {
            amount: true,
            source: true,
            reviewStatus: true,
            voidedAt: true,
          },
        },
      },
    });

    return orders.map((order) => {
      const summary = withPaymentSummary(order);
      return {
        id: summary.id,
        paymentStatus: summary.paymentStatus,
        fulfillmentStatus: summary.fulfillmentStatus,
        totalAmount: summary.totalAmount.toString(),
        currency: summary.currency,
        createdAt: summary.createdAt.toISOString(),
        paidAmount: summary.paidAmount,
        pendingAmount: summary.pendingAmount,
        paidPercentage: summary.paidPercentage,
        storeSlug: order.store.slug,
        storeName: order.store.name,
        source: order.source,
        claimedAt: order.claimedAt?.toISOString() ?? null,
      };
    });
  }

  // One order of this buyer account. The ownership filter is in the query
  // itself, so a foreign or missing id gives the same 404 and nothing about
  // its existence. Explicit selects: no proof image URLs, rejection notes,
  // reviewer ids or void reasons ever reach the buyer.
  async getGlobalOrderDetail(
    buyerAccountId: string,
    orderId: string,
  ): Promise<GlobalAccountOrderDetailResponseDto> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, buyerAccountId },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        totalAmount: true,
        requiredAmount: true,
        currency: true,
        createdAt: true,
        source: true,
        claimedAt: true,
        trackingNumber: true,
        trackingUrl: true,
        buyerConfirmedReceivedAt: true,
        store: { select: { slug: true, name: true } },
        items: {
          select: {
            quantity: true,
            unitPriceAtPurchase: true,
            currency: true,
            product: { select: { name: true } },
          },
        },
        payments: {
          orderBy: { createdAt: 'asc' },
          select: {
            amount: true,
            source: true,
            reviewStatus: true,
            createdAt: true,
            voidedAt: true,
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');

    const summary = withPaymentSummary(order);
    const events = await this.events.listForBuyer(order.id);
    return {
      id: order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      totalAmount: order.totalAmount.toString(),
      requiredAmount: order.requiredAmount.toString(),
      currency: order.currency,
      createdAt: order.createdAt.toISOString(),
      paidAmount: summary.paidAmount,
      pendingAmount: summary.pendingAmount,
      paidPercentage: summary.paidPercentage,
      storeSlug: order.store.slug,
      storeName: order.store.name,
      source: order.source,
      claimedAt: order.claimedAt?.toISOString() ?? null,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      receiptConfirmedAt: order.buyerConfirmedReceivedAt?.toISOString() ?? null,
      items: order.items.map((item) => ({
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: item.unitPriceAtPurchase.toString(),
        currency: item.currency,
      })),
      payments: order.payments.map((payment) => ({
        source: payment.source,
        amount: payment.amount.toString(),
        createdAt: payment.createdAt.toISOString(),
        voidedAt: payment.voidedAt?.toISOString() ?? null,
        reviewStatus: payment.reviewStatus,
      })),
      timeline: toPublicTimeline(events),
    };
  }
}
