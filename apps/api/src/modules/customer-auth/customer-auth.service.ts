import {
  BadRequestException,
  ConflictException,
  Injectable,
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
import { requiredEnv } from '../../config/env.validation.js';
import { withPaymentSummary } from '../../common/payment-summary.js';
import { toAccountOrderDto } from './dto/account-order-response.dto.js';

@Injectable()
export class CustomerAuthService {
  constructor(
    private prisma: PrismaService,
    private customerAccount: CustomerAccountService,
    private orderRepository: OrderRepository,
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

  // Google proves ownership of an email, not a phone number. Resolution
  // order: (1) the account already bound to this Google `sub`; (2) exactly one
  // account with that email whose email is already VERIFIED, which gets bound
  // to the `sub`; (3) otherwise a new phone-less account. An unverified
  // same-email account is never linked nor flipped to verified: anyone can
  // register a phone account with a victim's email (unverified) and a password
  // they know, so linking it would hand the victim's Google login to them.
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

  private async resolveGoogleAccount(identity: {
    sub: string;
    email: string;
    name: string | null;
  }): Promise<{ id: string; passwordVersion: number }> {
    const bySub = await this.prisma.buyerAccount.findUnique({
      where: { googleSub: identity.sub },
    });
    if (bySub) return bySub;

    const matches = await this.prisma.buyerAccount.findMany({
      where: {
        email: { equals: identity.email, mode: 'insensitive' },
        emailVerified: true,
      },
    });
    if (matches.length > 1) {
      throw new ConflictException('Hay más de una cuenta con este correo');
    }

    const existing = matches[0];
    if (existing) {
      // Bound to this very identity (a concurrent first login won the race
      // after our `googleSub` lookup): sign in. Bound to another one: not ours
      // to take over.
      if (existing.googleSub === identity.sub) return existing;
      if (existing.googleSub) {
        throw new ConflictException('Esta cuenta ya está vinculada a Google');
      }
      const { count } = await this.prisma.buyerAccount.updateMany({
        where: { id: existing.id, googleSub: null },
        data: {
          googleSub: identity.sub,
          ...(existing.name ? {} : { name: identity.name }),
        },
      });
      if (count === 1) return existing;
      // Lost a race with another first login: whoever bound the sub wins.
      const winner = await this.prisma.buyerAccount.findUnique({
        where: { googleSub: identity.sub },
      });
      if (winner) return winner;
      throw new ConflictException('Esta cuenta ya está vinculada a Google');
    }

    try {
      return await this.prisma.buyerAccount.create({
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
        const winner = await this.prisma.buyerAccount.findUnique({
          where: { googleSub: identity.sub },
        });
        if (winner) return winner;
      }
      throw err;
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
      };
    });
  }
}
