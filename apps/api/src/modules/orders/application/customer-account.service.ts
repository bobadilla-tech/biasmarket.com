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
  async findOrCreateCustomer(
    tx: Prisma.TransactionClient | PrismaService,
    storeId: string,
    phone: string,
    email: string,
    name: string | undefined,
  ): Promise<{
    customer: Customer | null;
    buyerAccount: BuyerAccount | null;
    needsVerificationEmail: boolean;
  }> {
    const normalizedPhone = normalizePhone(phone);
    const existing = await tx.buyerAccount.findUnique({
      where: { phone: normalizedPhone },
    });

    let buyerAccount: BuyerAccount;
    let needsVerificationEmail: boolean;

    if (!existing) {
      buyerAccount = await tx.buyerAccount.create({
        data: { phone: normalizedPhone, email, name, emailVerified: false },
      });
      needsVerificationEmail = true;
    } else if (existing.email !== email) {
      // Matching phone with a different email than what's on file — could be
      // a typo, or someone else's checkout using a phone number they know
      // but don't own the account for. Never mutate an existing buyer's
      // identity from an unauthenticated checkout request: don't touch
      // email/emailVerified, don't link this order to their buyerAccountId,
      // don't create a store link or Customer row, don't send a
      // verification email. Falls back to a guest order.
      return {
        customer: null,
        buyerAccount: null,
        needsVerificationEmail: false,
      };
    } else if (existing.emailVerified) {
      buyerAccount = existing;
      needsVerificationEmail = false;
    } else {
      buyerAccount = await tx.buyerAccount.update({
        where: { id: existing.id },
        data: { email, emailVerified: false },
      });
      needsVerificationEmail = true;
    }

    await tx.customerStoreLink.upsert({
      where: {
        buyerAccountId_storeId: { buyerAccountId: buyerAccount.id, storeId },
      },
      create: { buyerAccountId: buyerAccount.id, storeId },
      update: {},
    });

    const existingCustomer = await tx.customer.findUnique({
      where: { storeId_phone: { storeId, phone: normalizedPhone } },
    });
    const customer = existingCustomer
      ? await tx.customer.update({
          where: { id: existingCustomer.id },
          data: { email, name, emailVerified: buyerAccount.emailVerified },
        })
      : await tx.customer.create({
          data: {
            storeId,
            phone: normalizedPhone,
            email,
            name,
            emailVerified: buyerAccount.emailVerified,
          },
        });

    return { customer, buyerAccount, needsVerificationEmail };
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

  async sendPasswordResetEmail(
    buyerAccount: BuyerAccount,
    store: Store,
  ): Promise<void> {
    if (!buyerAccount.email) return;

    try {
      const secret = requiredEnv('CUSTOMER_ACCOUNT_TOKEN_SECRET');
      const token = createCustomerAccountToken(
        buyerAccount.id,
        secret,
        'reset',
      );
      const url = this.confirmUrl(store.slug, token);

      await this.mailer.send({
        to: buyerAccount.email,
        subject: 'Restablece tu contraseña — Bias Market / Reset your password',
        html: buildPasswordResetEmailHtml(url, store.name),
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
      const existing = await this.prisma.buyerAccount.findUnique({
        where: { phone: normalizedPhone },
      });
      if (existing && existing.id !== buyerAccount.id) {
        throw new ConflictException(
          'Ya existe un comprador con ese número de teléfono',
        );
      }
      buyerAccount = await this.prisma.buyerAccount.update({
        where: { id: buyerAccount.id },
        data: {
          phone: normalizedPhone,
          pendingPhone: null,
        },
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
        currency: true,
        createdAt: true,
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
      orders,
    };
  }
}
