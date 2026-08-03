import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { Customer, Prisma, Store } from "@biasmarket/db";
import { escapeHtml } from "@biasmarket/utils/strings";
import {
  createCustomerAccountToken,
  verifyCustomerAccountToken,
} from "@biasmarket/utils/customer-account-token";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { MailerService } from "../../../mailer/mailer.service.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

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

  async findOrCreateCustomer(
    tx: Prisma.TransactionClient | PrismaService,
    storeId: string,
    phone: string,
    email: string,
    name: string | undefined,
  ): Promise<{ customer: Customer | null; needsVerificationEmail: boolean }> {
    const existing = await tx.customer.findUnique({
      where: { storeId_phone: { storeId, phone } },
    });

    if (!existing) {
      const customer = await tx.customer.create({
        data: { storeId, phone, email, name, emailVerified: false },
      });
      return { customer, needsVerificationEmail: true };
    }

    if (existing.email !== email) {
      // Matching phone with a different email than what's on file — could be
      // a typo, or someone else's checkout using a phone number they know
      // but don't own the account for. Never mutate an existing customer's
      // identity from an unauthenticated checkout request: don't touch
      // email/emailVerified, don't link this order to their customerId,
      // don't send a verification email. Falls back to a guest order.
      return { customer: null, needsVerificationEmail: false };
    }

    if (existing.emailVerified) {
      return { customer: existing, needsVerificationEmail: false };
    }

    const customer = await tx.customer.update({
      where: { id: existing.id },
      data: { email, emailVerified: false },
    });
    return { customer, needsVerificationEmail: true };
  }

  async sendVerificationEmail(customer: Customer, store: Store): Promise<void> {
    if (!customer.email) return;

    try {
      const secret = requiredEnv("CUSTOMER_ACCOUNT_TOKEN_SECRET");
      const token = createCustomerAccountToken(customer.id, secret, "confirm");
      const url = this.confirmUrl(store.slug, token);

      await this.mailer.send({
        to: customer.email,
        subject: "Confirma tu cuenta — Bias Market / Confirm your account",
        html: buildCustomerVerificationEmailHtml(url, store.name),
      });
    } catch (err) {
      this.logger.error(
        `Failed to send customer verification email for ${customer.id}`,
        err,
      );
    }
  }

  async sendPasswordResetEmail(customer: Customer, store: Store): Promise<void> {
    if (!customer.email) return;

    try {
      const secret = requiredEnv("CUSTOMER_ACCOUNT_TOKEN_SECRET");
      const token = createCustomerAccountToken(customer.id, secret, "reset");
      const url = this.confirmUrl(store.slug, token);

      await this.mailer.send({
        to: customer.email,
        subject: "Restablece tu contraseña — Bias Market / Reset your password",
        html: buildPasswordResetEmailHtml(url, store.name),
      });
    } catch (err) {
      this.logger.error(
        `Failed to send password reset email for ${customer.id}`,
        err,
      );
    }
  }

  // Sent to the *new* address — that's what proves ownership of it.
  async sendEmailChangeConfirmation(
    customer: Customer,
    store: Store,
    newEmail: string,
  ): Promise<void> {
    try {
      const secret = requiredEnv("CUSTOMER_ACCOUNT_TOKEN_SECRET");
      const token = createCustomerAccountToken(
        customer.id,
        secret,
        "change-email",
      );
      const url = this.confirmUrl(store.slug, token);

      await this.mailer.send({
        to: newEmail,
        subject: "Confirma tu nuevo correo — Bias Market / Confirm your new email",
        html: buildEmailChangeEmailHtml(url, store.name),
      });
    } catch (err) {
      this.logger.error(
        `Failed to send email-change confirmation for ${customer.id}`,
        err,
      );
    }
  }

  // Sent to the *current, already-verified* email — there's no SMS channel
  // in this app to prove control of the new phone number, so control of the
  // account's existing verified email stands in for it instead.
  async sendPhoneChangeConfirmation(
    customer: Customer,
    store: Store,
  ): Promise<void> {
    if (!customer.email) return;

    try {
      const secret = requiredEnv("CUSTOMER_ACCOUNT_TOKEN_SECRET");
      const token = createCustomerAccountToken(
        customer.id,
        secret,
        "change-phone",
      );
      const url = this.confirmUrl(store.slug, token);

      await this.mailer.send({
        to: customer.email,
        subject: "Confirma tu nuevo teléfono — Bias Market / Confirm your new phone",
        html: buildPhoneChangeEmailHtml(url, store.name),
      });
    } catch (err) {
      this.logger.error(
        `Failed to send phone-change confirmation for ${customer.id}`,
        err,
      );
    }
  }

  private confirmUrl(storeSlug: string, token: string): string {
    const webUrl = process.env.WEB_URL ?? "http://localhost:3001";
    return `${webUrl}/store/${storeSlug}/account/confirm?token=${token}`;
  }

  async confirmAccount(storeSlug: string, token: string | undefined) {
    if (!token) throw new BadRequestException("Enlace inválido o expirado");

    const store = await this.prisma.store.findUnique({
      where: { slug: storeSlug },
    });
    if (!store) throw new NotFoundException("Store no encontrada");

    const secret = requiredEnv("CUSTOMER_ACCOUNT_TOKEN_SECRET");
    const verified = verifyCustomerAccountToken(token, secret);
    if (!verified) throw new BadRequestException("Enlace inválido o expirado");

    let customer = await this.prisma.customer.findUnique({
      where: { id: verified.customerId },
    });
    if (!customer || customer.storeId !== store.id) {
      throw new BadRequestException("Enlace inválido o expirado");
    }

    if (verified.purpose === "confirm" && !customer.emailVerified) {
      customer = await this.prisma.customer.update({
        where: { id: customer.id },
        data: { emailVerified: true },
      });
    } else if (verified.purpose === "change-email" && customer.pendingEmail) {
      customer = await this.prisma.customer.update({
        where: { id: customer.id },
        data: {
          email: customer.pendingEmail,
          pendingEmail: null,
          emailVerified: true,
        },
      });
    } else if (verified.purpose === "change-phone" && customer.pendingPhone) {
      customer = await this.prisma.customer.update({
        where: { id: customer.id },
        data: { phone: customer.pendingPhone, pendingPhone: null },
      });
    }

    const orders = await this.prisma.order.findMany({
      where: { customerId: customer.id, storeId: store.id },
      orderBy: { createdAt: "desc" },
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
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        hasPassword: Boolean(customer.passwordHash),
      },
      orders,
    };
  }
}
