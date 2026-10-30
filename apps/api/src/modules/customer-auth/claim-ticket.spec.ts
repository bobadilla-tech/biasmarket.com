import { createHmac } from "node:crypto";
import {
  createCustomerSessionToken,
  verifyCustomerSessionToken,
} from "@biasmarket/utils/customer-account-token";
import {
  CLAIM_TICKET_TTL_MS,
  linkFingerprint,
  signClaimTicket,
  verifyClaimTicket,
} from "./claim-ticket.js";

const hash = "a".repeat(64);

describe("claim ticket", () => {
  beforeEach(() => {
    process.env.CUSTOMER_ACCOUNT_TOKEN_SECRET = "test-secret";
  });

  it("round-trips order id, link fingerprint and moment", () => {
    const ticket = verifyClaimTicket(
      signClaimTicket(
        { orderId: "o1", accessTokenHash: hash, moment: "banner" },
        1000,
      ),
      2000,
    );
    expect(ticket).toEqual({
      orderId: "o1",
      linkFp: linkFingerprint(hash),
      moment: "banner",
      exp: 1000 + CLAIM_TICKET_TTL_MS,
    });
    expect(ticket?.linkFp).toHaveLength(16);
  });

  it("omits the moment when none was given", () => {
    const ticket = verifyClaimTicket(
      signClaimTicket({ orderId: "o1", accessTokenHash: hash }, 1000),
      2000,
    );
    expect(ticket).not.toHaveProperty("moment");
  });

  it("never carries the raw link hash, only its prefix", () => {
    const value = signClaimTicket({ orderId: "o1", accessTokenHash: hash });
    const body = Buffer.from(value.split(".")[0]!, "base64url").toString();
    expect(body).not.toContain(hash);
  });

  it("rejects missing, malformed, forged, tampered and expired tickets", () => {
    const valid = signClaimTicket(
      { orderId: "o1", accessTokenHash: hash },
      1000,
    );
    const [payload, signature] = valid.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ orderId: "o2", linkFp: "x", exp: 9e15 }),
    ).toString("base64url");

    expect(verifyClaimTicket(undefined)).toBeNull();
    expect(verifyClaimTicket("")).toBeNull();
    expect(verifyClaimTicket("not-a-ticket")).toBeNull();
    expect(verifyClaimTicket(`${payload}.${signature}.extra`)).toBeNull();
    expect(verifyClaimTicket(`${forgedPayload}.${signature}`)).toBeNull();
    expect(verifyClaimTicket(`${payload}.bad`, 2000)).toBeNull();
    expect(verifyClaimTicket(valid, 1000 + CLAIM_TICKET_TTL_MS + 1)).toBeNull();
  });

  it("rejects a payload signed with another context (e.g. the OAuth state)", () => {
    const payload = Buffer.from(
      JSON.stringify({ orderId: "o1", linkFp: "abc", exp: 9e15 }),
    ).toString("base64url");
    const stateSignature = createHmac("sha256", "test-secret")
      .update(`buyer-google-state:${payload}`)
      .digest("base64url");
    expect(verifyClaimTicket(`${payload}.${stateSignature}`)).toBeNull();
  });

  it("is not a session token, and a session token is not a ticket", () => {
    const ticket = signClaimTicket({ orderId: "o1", accessTokenHash: hash });
    expect(verifyCustomerSessionToken(ticket, "test-secret")).toBeNull();
    const session = createCustomerSessionToken("buyer-1", 0, "test-secret");
    expect(verifyClaimTicket(session)).toBeNull();
  });

  it("rejects an unknown moment", () => {
    const payload = Buffer.from(
      JSON.stringify({
        orderId: "o1",
        linkFp: "abc",
        moment: "whatever",
        exp: 9e15,
      }),
    ).toString("base64url");
    const signature = createHmac("sha256", "test-secret")
      .update(`claim-ticket:${payload}`)
      .digest("base64url");
    expect(verifyClaimTicket(`${payload}.${signature}`)).toBeNull();
  });
});
