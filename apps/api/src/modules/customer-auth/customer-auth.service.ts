import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import {
  createCustomerSessionToken,
  verifyCustomerAccountToken,
} from "@biasmarket/utils/customer-account-token";
import { PrismaService } from "../../prisma/prisma.service.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Derives a short, stable fingerprint of the current password hash. Embedded
// in every session token issued for a customer (see
// createCustomerSessionToken) so that changing the password invalidates
// every token issued before the change — the only revocation mechanism this
// stateless-token session design has (see docs/plans/2026-08-02-buyer-accounts-phase12-plan.md,
// "Session storage").
export function derivePasswordVersion(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("base64url").slice(
    0,
    16,
  );
}

@Injectable()
export class CustomerAuthService {
  constructor(private prisma: PrismaService) {}

  private async findStoreBySlug(slug: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException("Store no encontrada");
    return store;
  }

  private issueSessionToken(
    customerId: string,
    storeId: string,
    passwordHash: string,
  ): string {
    const secret = requiredEnv("CUSTOMER_ACCOUNT_TOKEN_SECRET");
    return createCustomerSessionToken(
      customerId,
      storeId,
      derivePasswordVersion(passwordHash),
      secret,
    );
  }

  async register(
    slug: string,
    token: string,
    password: string,
  ): Promise<{ ok: true }> {
    const store = await this.findStoreBySlug(slug);

    const secret = requiredEnv("CUSTOMER_ACCOUNT_TOKEN_SECRET");
    const verified = verifyCustomerAccountToken(token, secret);
    if (!verified) throw new BadRequestException("Enlace inválido o expirado");

    const customer = await this.prisma.customer.findUnique({
      where: { id: verified.customerId },
    });
    if (!customer || customer.storeId !== store.id) {
      throw new BadRequestException("Enlace inválido o expirado");
    }

    // The magic-link token itself is the "verified proof of email ownership"
    // this endpoint requires — it's not single-use by itself (a stateless
    // HMAC token, replayable within its own 30-day TTL). Single-use for
    // *registration* specifically comes from this check instead: once
    // passwordHash is set, every later register call for this customer is
    // rejected, so the same magic-link token can't be replayed to overwrite
    // an already-set password.
    if (customer.passwordHash) {
      throw new ConflictException(
        "Esta cuenta ya tiene una contraseña configurada",
      );
    }

    const passwordHash = await hashPassword(password);
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { passwordHash, emailVerified: true },
    });

    return { ok: true };
  }

  async login(slug: string, phone: string, password: string): Promise<string> {
    const store = await this.findStoreBySlug(slug);
    const customer = await this.prisma.customer.findUnique({
      where: { storeId_phone: { storeId: store.id, phone } },
    });

    // Same generic error whether the phone doesn't exist or the password is
    // wrong — never leak which one it was.
    if (!customer?.passwordHash) {
      throw new UnauthorizedException("Teléfono o contraseña inválidos");
    }

    const valid = await verifyPassword({
      hash: customer.passwordHash,
      password,
    });
    if (!valid) {
      throw new UnauthorizedException("Teléfono o contraseña inválidos");
    }

    return this.issueSessionToken(
      customer.id,
      customer.storeId,
      customer.passwordHash,
    );
  }

  async changePassword(
    customerId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<string> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer?.passwordHash) {
      throw new UnauthorizedException("No autenticado");
    }

    const valid = await verifyPassword({
      hash: customer.passwordHash,
      password: currentPassword,
    });
    if (!valid) throw new BadRequestException("Contraseña actual incorrecta");

    const passwordHash = await hashPassword(newPassword);
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { passwordHash },
    });

    return this.issueSessionToken(customer.id, customer.storeId, passwordHash);
  }

  // `slug` comes from the route, `session.storeId` from the signed cookie —
  // asserting they match is what stops a valid session for store A from
  // reading/editing a profile through store B's URL. Same ownership-check
  // discipline as `assertOwnership` elsewhere in the codebase, just against
  // a store slug instead of a User-owned resource.
  private async assertStoreMatch(slug: string, storeId: string) {
    const store = await this.findStoreBySlug(slug);
    if (store.id !== storeId) throw new ForbiddenException("No autorizado");
  }

  async getProfile(slug: string, session: { id: string; storeId: string }) {
    await this.assertStoreMatch(slug, session.storeId);

    const customer = await this.prisma.customer.findUniqueOrThrow({
      where: { id: session.id },
    });
    const orders = await this.prisma.order.findMany({
      where: { customerId: customer.id, storeId: customer.storeId },
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
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        emailVerified: customer.emailVerified,
      },
      orders,
    };
  }

  async updateProfile(
    slug: string,
    session: { id: string; storeId: string },
    name: string,
  ) {
    await this.assertStoreMatch(slug, session.storeId);

    const customer = await this.prisma.customer.update({
      where: { id: session.id },
      data: { name },
    });
    return { name: customer.name };
  }
}
