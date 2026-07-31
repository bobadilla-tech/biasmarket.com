import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Customer, Store } from '@biasmarket/db';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { MailerService } from '../../../mailer/mailer.service.js';
import { createCustomerAccountToken, verifyCustomerAccountToken } from './customer-account-token.js';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function buildCustomerVerificationEmailHtml(url: string, storeName: string): string {
  return `
    <p>Hola,</p>
    <p>Confirma tu cuenta de comprador en ${storeName} y revisa el estado de tu pedido haciendo clic en el siguiente enlace:</p>
    <p><a href="${url}">${url}</a></p>
    <p>Si no compraste en ${storeName}, ignora este correo.</p>
    <hr />
    <p>Hi,</p>
    <p>Confirm your buyer account at ${storeName} and check your order status by clicking the link below:</p>
    <p><a href="${url}">${url}</a></p>
    <p>If you didn't buy from ${storeName}, ignore this email.</p>
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
    storeId: string,
    phone: string,
    email: string,
    name: string | undefined,
  ): Promise<{ customer: Customer; needsVerificationEmail: boolean }> {
    const existing = await this.prisma.customer.findUnique({
      where: { storeId_phone: { storeId, phone } },
    });

    if (!existing) {
      const customer = await this.prisma.customer.create({
        data: { storeId, phone, email, name, emailVerified: false },
      });
      return { customer, needsVerificationEmail: true };
    }

    if (existing.email === email && existing.emailVerified) {
      return { customer: existing, needsVerificationEmail: false };
    }

    const customer = await this.prisma.customer.update({
      where: { id: existing.id },
      data: { email, emailVerified: false },
    });
    return { customer, needsVerificationEmail: true };
  }

  async sendVerificationEmail(customer: Customer, store: Store): Promise<void> {
    if (!customer.email) return;

    try {
      const secret = requiredEnv('BETTER_AUTH_SECRET');
      const token = createCustomerAccountToken(customer.id, secret);
      const webUrl = process.env.WEB_URL ?? 'http://localhost:3001';
      const url = `${webUrl}/store/${store.slug}/account/confirm?token=${token}`;

      await this.mailer.send({
        to: customer.email,
        subject: 'Confirma tu cuenta — Bias Market / Confirm your account',
        html: buildCustomerVerificationEmailHtml(url, store.name),
      });
    } catch (err) {
      this.logger.error(`Failed to send customer verification email for ${customer.id}`, err);
    }
  }

  async confirmAccount(storeSlug: string, token: string | undefined) {
    if (!token) throw new BadRequestException('Enlace inválido o expirado');

    const store = await this.prisma.store.findUnique({ where: { slug: storeSlug } });
    if (!store) throw new NotFoundException('Store no encontrada');

    const secret = requiredEnv('BETTER_AUTH_SECRET');
    const verified = verifyCustomerAccountToken(token, secret);
    if (!verified) throw new BadRequestException('Enlace inválido o expirado');

    const customer = await this.prisma.customer.findUnique({
      where: { id: verified.customerId },
    });
    if (!customer || customer.storeId !== store.id) {
      throw new BadRequestException('Enlace inválido o expirado');
    }

    if (!customer.emailVerified) {
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: { emailVerified: true },
      });
    }

    const orders = await this.prisma.order.findMany({
      where: { customerId: customer.id, storeId: store.id },
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
      customer: { name: customer.name, email: customer.email, phone: customer.phone },
      orders,
    };
  }
}
