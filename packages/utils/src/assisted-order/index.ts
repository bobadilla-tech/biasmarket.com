import { createHash, randomBytes } from "node:crypto";
import { normalizePhone } from "../phone-country/index.js";

// 32 bytes is 256 bits, above the 128-bit floor for the private link.
const TOKEN_BYTES = 32;

// E.164: leading +, first digit 1-9, at most 15 digits total.
const E164 = /^\+[1-9]\d{7,14}$/;

export type OrderSource = "MARKETPLACE" | "VENDOR_ASSISTED";

export function createOrderAccessToken(): { token: string; tokenHash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashOrderAccessToken(token) };
}

export function hashOrderAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class AssistedOrderInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistedOrderInvariantError";
  }
}

// Marketplace checkout is unchanged. A seller-created order must already
// carry a canonical E.164 phone and the seller who created it. The user
// row itself is enforced by the createdByUserId foreign key.
export function assertVendorAssistedOrder(input: {
  source: OrderSource;
  customerPhone: string;
  createdByUserId: string | null | undefined;
}): void {
  if (input.source !== "VENDOR_ASSISTED") return;

  if (!input.createdByUserId?.trim()) {
    throw new AssistedOrderInvariantError(
      "Un pedido asistido requiere el vendedor que lo creó",
    );
  }

  if (!isCanonicalE164(input.customerPhone)) {
    throw new AssistedOrderInvariantError(
      "Un pedido asistido requiere el teléfono en formato E.164",
    );
  }
}

function isCanonicalE164(phone: string): boolean {
  return E164.test(phone) && phone === normalizePhone(phone);
}
