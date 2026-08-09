import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requiredEnv, validateEnv } from "./env.validation.js";

const REQUIRED = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "WEB_URL",
  "CUSTOMER_ACCOUNT_TOKEN_SECRET",
  "S3_BUCKET",
  "S3_LOGO_BUCKET",
  "S3_PAYMENT_BUCKET",
  "S3_PUBLIC_URL",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
];

const OPTIONAL = [
  "MAIL_DRIVER",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "NODE_ENV",
];

// Capture original values once at module load so the suite can restore
// process.env exactly, distinguishing vars that were unset (deleted) from
// vars that had a value.
const ORIGINAL = Object.fromEntries(
  [...REQUIRED, ...OPTIONAL].map((name) => [name, process.env[name]]),
);

function restore(name: string) {
  const original = ORIGINAL[name];
  if (original === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = original;
  }
}

function setAllRequired() {
  for (const name of REQUIRED) process.env[name] = `test-${name}`;
}

describe("requiredEnv", () => {
  afterEach(() => {
    delete process.env.REQUIRED_ENV_TEST;
  });

  it("returns the value when set", () => {
    process.env.REQUIRED_ENV_TEST = "abc";
    expect(requiredEnv("REQUIRED_ENV_TEST")).toBe("abc");
  });

  it("throws the canonical message when missing", () => {
    delete process.env.REQUIRED_ENV_TEST;
    expect(() => requiredEnv("REQUIRED_ENV_TEST")).toThrow(
      "Missing required env var: REQUIRED_ENV_TEST",
    );
  });
});

describe("validateEnv", () => {
  beforeEach(() => {
    setAllRequired();
    process.env.MAIL_DRIVER = "file";
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    for (const name of [...REQUIRED, ...OPTIONAL]) restore(name);
  });

  it("passes when every required var is set with the file mail driver", () => {
    expect(() => validateEnv()).not.toThrow();
  });

  it("refuses to boot when CUSTOMER_ACCOUNT_TOKEN_SECRET is missing", () => {
    delete process.env.CUSTOMER_ACCOUNT_TOKEN_SECRET;
    expect(() => validateEnv()).toThrow(
      "Missing required env var: CUSTOMER_ACCOUNT_TOKEN_SECRET",
    );
  });

  it("refuses to boot when DATABASE_URL is missing", () => {
    delete process.env.DATABASE_URL;
    expect(() => validateEnv()).toThrow(
      "Missing required env var: DATABASE_URL",
    );
  });

  it("refuses to boot when BETTER_AUTH_SECRET is missing", () => {
    delete process.env.BETTER_AUTH_SECRET;
    expect(() => validateEnv()).toThrow(
      "Missing required env var: BETTER_AUTH_SECRET",
    );
  });

  it("does not require RESEND_* while MAIL_DRIVER=file (or unset)", () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    expect(() => validateEnv()).not.toThrow();

    delete process.env.MAIL_DRIVER;
    expect(() => validateEnv()).not.toThrow();
  });

  it("requires RESEND_* when MAIL_DRIVER=resend", () => {
    process.env.MAIL_DRIVER = "resend";
    delete process.env.RESEND_API_KEY;
    expect(() => validateEnv()).toThrow(
      "Missing required env var: RESEND_API_KEY",
    );
  });

  it("rejects an invalid MAIL_DRIVER value", () => {
    process.env.MAIL_DRIVER = "smtp";
    expect(() => validateEnv()).toThrow('Invalid MAIL_DRIVER: "smtp"');
  });
});
