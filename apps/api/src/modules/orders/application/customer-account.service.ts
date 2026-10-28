import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { BuyerAccount, Customer, Prisma, Store } from '@biasmarket/db';
import { escapeHtml } from '@biasmarket/utils/strings';
import { normalizePhone } from '@biasmarket/utils/phone-country';
import {
  createCustomerAccountToken,
  verifyCustomerAccountToken,
} from '@biasmarket/utils/customer-account-token';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { MailerService } from '../../../mailer/mailer.service.js';
import { requiredEnv } from '../../../config/env.validation.js';
import { withPaymentSummary } from '../../../common/payment-summary.js';
import { upsertAssistedCustomer } from './assisted-customer.js';
import { toAccountOrderDto } from '../../customer-auth/dto/account-order-response.dto.js';

// The loser of an identity race, or a checkout that must not touch an existing
// buyer: the order is placed as a guest order and nothing is linked.
const GUEST_RESULT = {
  customer: null,
  buyerAccount: null,
  needsVerificationEmail: false,
};

function buildCustomerVerificationEmailHtml(
  url: string,
  storeName: string,
): string {
  const safeStoreName = escapeHtml(storeName);
  const safeUrl = escapeHtml(url);
  return `
    <p>Hola,</p>
    <p>Confirma tu cuenta de comprador en ${safeStoreName} y revisa el estado de tu pedido haciendo clic en el siguiente enlace:</p>
    <p><a href="${safeUrl}">${safeUrl}</a></p>
    <p>Si no compraste en ${safeStoreName}, ignora este correo.</p>
    <hr />
    <p>Hi,</p>
    <p>Confirm your buyer account at ${safeStoreName} and check your order status by clicking the link below:</p>
    <p><a href="${safeUrl}">${safeUrl}</a></p>
    <p>If you didn't buy from ${safeStoreName}, ignore this email.</p>
  `;
}

function buildPasswordResetEmailHtml(url: string, storeName: string): string {
  const safeStoreName = escapeHtml(storeName);
  const safeUrl = escapeHtml(url);
  return `
    <p>Hola,</p>
    <p>Restablece tu contraseña en ${safeStoreName} haciendo clic en el siguiente enlace:</p>
    <p><a href="${safeUrl}">${safeUrl}</a></p>
    <p>Si no solicitaste esto, ignora este correo.</p>
    <hr />
    <p>Hi,</p>
    <p>Reset your password at ${safeStoreName} by clicking the link below:</p>
    <p><a href="${safeUrl}">${safeUrl}</a></p>
    <p>If you didn't request this, ignore this email.</p>
  `;
}

function buildEmailChangeEmailHtml(url: string, storeName: string): string {
  const safeStoreName = escapeHtml(storeName);
  const safeUrl = escapeHtml(url);
  return `
    <p>Hola,</p>
    <p>Confirma tu nuevo correo para tu cuenta en ${safeStoreName} haciendo clic en el siguiente enlace:</p>
    <p><a href="${safeUrl}">${safeUrl}</a></p>
    <p>Si no solicitaste esto, ignora este correo.</p>
    <hr />
    <p>Hi,</p>
    <p>Confirm your new email for your account at ${safeStoreName} by clicking the link below:</p>
    <p><a href="${safeUrl}">${safeUrl}</a></p>
    <p>If you didn't request this, ignore this email.</p>
  `;
}

function buildPhoneChangeEmailHtml(url: string, storeName: string): string {
  const safeStoreName = escapeHtml(storeName);
  const safeUrl = escapeHtml(url);
  return `
    <p>Hola,</p>
    <p>Confirma el cambio de número de teléfono en tu cuenta de ${safeStoreName} haciendo clic en el siguiente enlace:</p>
    <p><a href="${safeUrl}">${safeUrl}</a></p>
    <p>Si no solicitaste esto, ignora este correo.</p>
    <hr />
    <p>Hi,</p>
    <p>Confirm the phone number change on your ${safeStoreName} account by clicking the link below:</p>
    <p><a href="${safeUrl}">${safeUrl}</a></p>
    <p>If you didn't request this, ignore this email.</p>
  `;
}

@Injectable()
export class CustomerAccountService {
  private readonly logger = new Logger(CustomerAccountService.name);

  constructor(
    private prisma: PrismaService,
    private mailer: MailerService,
  ) {}

  // Resolves/creates the global `BuyerAccount` for this phone number, then
  // ensures a `CustomerStoreLink` (this store) and a `Customer` projection
  // row (the seller-facing "who has bought here" dashboard, decoupled from
  // auth — see the plan doc's "What happens to Customer") both exist for it.
  // The identity-mismatch guard now runs against `BuyerAccount` (global)
  // instead of the old per-store `Customer` check, since the phone number is
  // now the global identity key.
  //
  // Concurrency (#333): two checkouts for the same new phone used to race on
  // `BuyerAccount_phone_key` / `CustomerStoreLink_buyerAccountId_storeId_key`
  // and the loser got a 500. A per-phone advisory lock serialises them, and
  // every insert is `ON CONFLICT DO NOTHING` + re-read as defence in depth for
  // writers that do not take the lock. Nothing in here may be wrapped in a
  // try/catch: a failed statement aborts the transaction (25P02) and Prisma
  // opens no savepoints. Never `FOR UPDATE` the Customer row (it would block
  // the Order FK insert, see assisted-customer.ts).
  async findOrCreateCustomer(
    tx: Prisma.TransactionClient | PrismaService,
    storeId: string,
    phone: string,
    email: string,
    name: string | undefined,
    session?: { buyerAccountId: string; passwordVersion: number },
  ): Promise<{
    customer: Customer | null;
    buyerAccount: BuyerAccount | null;
    needsVerificationEmail: boolean;
  }> {
    const normalizedPhone = normalizePhone(phone);
    await this.lockBuyerPhone(tx, normalizedPhone);

    let buyerAccount = await tx.buyerAccount.findUnique({
      where: { phone: normalizedPhone },
    });
    let needsVerificationEmail = false;
    let attachedToSession = false;

    if (!buyerAccount) {
      // A signed-in buyer who joined with Google has no phone yet: this
      // checkout is where it gets attached to their existing account, so
      // their orders show up under it. Only ever for the verified session
      // owner, never from an unauthenticated request.
      const own = session
        ? await tx.buyerAccount.findUnique({
            where: { id: session.buyerAccountId },
          })
        : null;
      const sessionOwnsEmail =
        own !== null &&
        own.passwordVersion === session?.passwordVersion &&
        own.phone === null &&
        own.email?.toLowerCase() === email.toLowerCase();

      if (own && sessionOwnsEmail) {
        // The same Google session posting two checkouts with different phones
        // takes two different advisory locks, so guard on the row itself.
        const { count } = await tx.buyerAccount.updateMany({
          where: { id: own.id, phone: null },
          data: { phone: normalizedPhone, name: own.name ?? name },
        });
        if (count === 0) return GUEST_RESULT;
        // Never fall through to the create path: the account now holds the
        // other phone, so `phoneLessOwner` would miss it and a second
        // BuyerAccount with the same email would be minted.
        buyerAccount = await tx.buyerAccount.findUniqueOrThrow({
          where: { id: own.id },
        });
        attachedToSession = true;
      } else {
        // An unauthenticated checkout must not create a second account for an
        // email that already belongs to a phone-less (Google) account — that
        // would make the email ambiguous. Falls back to a guest order, like
        // the email-mismatch case below.
        const phoneLessOwner = await tx.buyerAccount.findFirst({
          where: { phone: null, email: { equals: email, mode: 'insensitive' } },
        });
        if (phoneLessOwner) return GUEST_RESULT;

        await tx.$executeRaw`
          INSERT INTO "BuyerAccount" ("id", "phone", "email", "name", "emailVerified")
          VALUES (${randomUUID()}, ${normalizedPhone}, ${email}, ${name ?? null}::text, false)
          ON CONFLICT ("phone") DO NOTHING
        `;
        buyerAccount = await tx.buyerAccount.findUnique({
          where: { phone: normalizedPhone },
        });
        if (!buyerAccount) {
          throw new ConflictException(
            'No se pudo registrar al comprador, intenta de nuevo',
          );
        }
      }
    }

    // Existing-account rules run on the row that was found, whether it was
    // there before us, just inserted by us, or inserted by a concurrent winner.
    if (!attachedToSession) {
      if (buyerAccount.email !== email) {
        // Matching phone with a different email than what's on file — could be
        // a typo, or someone else's checkout using a phone number they know
        // but don't own the account for. Never mutate an existing buyer's
        // identity from an unauthenticated checkout request: don't touch
        // email/emailVerified, don't link this order to their buyerAccountId,
        // don't create a store link or Customer row, don't send a
        // verification email. Falls back to a guest order.
        return GUEST_RESULT;
      }
      if (!buyerAccount.emailVerified) {
        buyerAccount = await tx.buyerAccount.update({
          where: { id: buyerAccount.id },
          data: { email, emailVerified: false },
        });
        needsVerificationEmail = true;
      }
    }

    await tx.$executeRaw`
      INSERT INTO "CustomerStoreLink" ("id", "buyerAccountId", "storeId")
      VALUES (${randomUUID()}, ${buyerAccount.id}, ${storeId})
      ON CONFLICT ("buyerAccountId", "storeId") DO NOTHING
    `;

    const { id: customerId } = await upsertAssistedCustomer(
      tx,
      storeId,
      normalizedPhone,
      null,
    );
    const customer = await tx.customer.update({
      where: { id: customerId, storeId },
      data: { email, name, emailVerified: buyerAccount.emailVerified },
    });

    return { customer, buyerAccount, needsVerificationEmail };
  }

  // Serialises everything that writes the buyer identity of one phone. The
  // same technique as `OrderEventsService.recordInvite`; `hashtext` is 32 bits
  // so a collision only costs a spurious wait.
  private async lockBuyerPhone(
    tx: Prisma.TransactionClient | PrismaService,
    normalizedPhone: string,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`buyer-phone:${normalizedPhone}`}))`;
  }

  async sendVerificationEmail(
    buyerAccount: BuyerAccount,
    store: Store,
  ): Promise<void> {
    if (!buyerAccount.email) return;

    try {
      const secret = requiredEnv('CUSTOMER_ACCOUNT_TOKEN_SECRET');
      const token = createCustomerAccountToken(
        buyerAccount.id,
        secret,
        'confirm',
      );
      const url = this.confirmUrl(store.slug, token);

      await this.mailer.send({
        to: buyerAccount.email,
        subject: 'Confirma tu cuenta — Bias Market / Confirm your account',
        html: buildCustomerVerificationEmailHtml(url, store.name),
      });
    } catch (err) {
      this.logger.error(
        `Failed to send customer verification email for ${buyerAccount.id}`,
        err,
      );
    }
  }

  // `store` is null for the global (My purchases) reset flow: the email then
  // names Bias Market and links to the global reset page instead of a store's.
  async sendPasswordResetEmail(
    buyerAccount: BuyerAccount,
    store: Store | null,
  ): Promise<void> {
    if (!buyerAccount.email) return;

    try {
      const secret = requiredEnv('CUSTOMER_ACCOUNT_TOKEN_SECRET');
      const token = createCustomerAccountToken(
        buyerAccount.id,
        secret,
        'reset',
      );
      const url = store
        ? this.confirmUrl(store.slug, token)
        : this.globalResetUrl(token);

      await this.mailer.send({
        to: buyerAccount.email,
        subject: 'Restablece tu contraseña — Bias Market / Reset your password',
        html: buildPasswordResetEmailHtml(url, store?.name ?? 'Bias Market'),
      });
    } catch (err) {
      this.logger.error(
        `Failed to send password reset email for ${buyerAccount.id}`,
        err,
      );
    }
  }

  // Sent to the *new* address — that's what proves ownership of it.
  async sendEmailChangeConfirmation(
    buyerAccount: BuyerAccount,
    store: Store,
    newEmail: string,
  ): Promise<void> {
    try {
      const secret = requiredEnv('CUSTOMER_ACCOUNT_TOKEN_SECRET');
      const token = createCustomerAccountToken(
        buyerAccount.id,
        secret,
        'change-email',
      );
      const url = this.confirmUrl(store.slug, token);

      await this.mailer.send({
        to: newEmail,
        subject:
          'Confirma tu nuevo correo — Bias Market / Confirm your new email',
        html: buildEmailChangeEmailHtml(url, store.name),
      });
    } catch (err) {
      this.logger.error(
        `Failed to send email-change confirmation for ${buyerAccount.id}`,
        err,
      );
    }
  }

  // Sent to the *current, already-verified* email — there's no SMS channel
  // in this app to prove control of the new phone number, so control of the
  // account's existing verified email stands in for it instead.
  async sendPhoneChangeConfirmation(
    buyerAccount: BuyerAccount,
    store: Store,
  ): Promise<void> {
    if (!buyerAccount.email) return;

    try {
      const secret = requiredEnv('CUSTOMER_ACCOUNT_TOKEN_SECRET');
      const token = createCustomerAccountToken(
        buyerAccount.id,
        secret,
        'change-phone',
      );
      const url = this.confirmUrl(store.slug, token);

      await this.mailer.send({
        to: buyerAccount.email,
        subject:
          'Confirma tu nuevo teléfono — Bias Market / Confirm your new phone',
        html: buildPhoneChangeEmailHtml(url, store.name),
      });
    } catch (err) {
      this.logger.error(
        `Failed to send phone-change confirmation for ${buyerAccount.id}`,
        err,
      );
    }
  }

  private globalResetUrl(token: string): string {
    const webUrl = process.env.WEB_URL ?? 'http://localhost:3001';
    return `${webUrl}/my-purchases/reset-password?token=${token}`;
  }

  private confirmUrl(storeSlug: string, token: string): string {
    const webUrl = process.env.WEB_URL ?? 'http://localhost:3001';
    return `${webUrl}/store/${storeSlug}/account/confirm?token=${token}`;
  }

  async confirmAccount(storeSlug: string, token: string | undefined) {
    if (!token) throw new BadRequestException('Enlace inválido o expirado');

    const store = await this.prisma.store.findUnique({
      where: { slug: storeSlug },
    });
    if (!store) throw new NotFoundException('Store no encontrada');

    const secret = requiredEnv('CUSTOMER_ACCOUNT_TOKEN_SECRET');
    const verified = verifyCustomerAccountToken(token, secret);
    if (!verified) throw new BadRequestException('Enlace inválido o expirado');

    let buyerAccount = await this.prisma.buyerAccount.findUnique({
      where: { id: verified.buyerAccountId },
    });
    if (!buyerAccount) {
      throw new BadRequestException('Enlace inválido o expirado');
    }

    if (verified.purpose === 'confirm' && !buyerAccount.emailVerified) {
      buyerAccount = await this.prisma.buyerAccount.update({
        where: { id: buyerAccount.id },
        data: { emailVerified: true },
      });
    } else if (
      verified.purpose === 'change-email' &&
      buyerAccount.pendingEmail
    ) {
      buyerAccount = await this.prisma.buyerAccount.update({
        where: { id: buyerAccount.id },
        data: {
          email: buyerAccount.pendingEmail,
          pendingEmail: null,
          emailVerified: true,
        },
      });
    } else if (
      verified.purpose === 'change-phone' &&
      buyerAccount.pendingPhone
    ) {
      const normalizedPhone = normalizePhone(buyerAccount.pendingPhone);
      const accountId = buyerAccount.id;
      // Same advisory lock as checkout, so a confirm racing a checkout for the
      // same new phone ends in a 409 or a guest order, never a 500.
      buyerAccount = await this.prisma.$transaction(async (tx) => {
        await this.lockBuyerPhone(tx, normalizedPhone);
        const existing = await tx.buyerAccount.findUnique({
          where: { phone: normalizedPhone },
        });
        if (existing && existing.id !== accountId) {
          throw new ConflictException(
            'Ya existe un comprador con ese número de teléfono',
          );
        }
        // A double-clicked confirm must not misapply: only the first one still
        // sees a pending phone, the second just re-reads the account.
        await tx.buyerAccount.updateMany({
          where: { id: accountId, pendingPhone: { not: null } },
          data: { phone: normalizedPhone, pendingPhone: null },
        });
        return tx.buyerAccount.findUniqueOrThrow({ where: { id: accountId } });
      });
    }

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
      purpose: verified.purpose,
      customer: {
        name: buyerAccount.name,
        email: buyerAccount.email,
        phone: buyerAccount.phone,
        hasPassword: Boolean(buyerAccount.passwordHash),
      },
      orders: orders.map((order) =>
        toAccountOrderDto(withPaymentSummary(order)),
      ),
    };
  }
}
