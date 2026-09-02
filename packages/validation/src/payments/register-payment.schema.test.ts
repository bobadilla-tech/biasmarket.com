import { expect, test } from "vitest";
import { buildRegisterPaymentSchema } from "./register-payment.schema.js";

test("accepts a valid payment within the pending amount", () => {
  const schema = buildRegisterPaymentSchema(60);
  const result = schema.safeParse({
    amount: "40",
    method: "YAPE",
    note: "",
    file: null,
  });
  expect(result.success).toBe(true);
});

test("rejects an amount greater than the pending amount", () => {
  const schema = buildRegisterPaymentSchema(60);
  const result = schema.safeParse({
    amount: "100",
    method: "YAPE",
    note: "",
    file: null,
  });
  expect(result.success).toBe(false);
});

test("rejects a zero or negative amount", () => {
  const schema = buildRegisterPaymentSchema(60);
  const result = schema.safeParse({
    amount: "0",
    method: "YAPE",
    note: "",
    file: null,
  });
  expect(result.success).toBe(false);
});

test("rejects an unsupported method", () => {
  const schema = buildRegisterPaymentSchema(60);
  const result = schema.safeParse({
    amount: "10",
    method: "BITCOIN",
    note: "",
    file: null,
  });
  expect(result.success).toBe(false);
});

test("rejects a file larger than 5MB", () => {
  const schema = buildRegisterPaymentSchema(60);
  const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], "proof.png", {
    type: "image/png",
  });
  const result = schema.safeParse({
    amount: "10",
    method: "YAPE",
    note: "",
    file: bigFile,
  });
  expect(result.success).toBe(false);
});

test("rejects a non-image file type", () => {
  const schema = buildRegisterPaymentSchema(60);
  const pdfFile = new File(["%PDF"], "proof.pdf", { type: "application/pdf" });
  const result = schema.safeParse({
    amount: "10",
    method: "YAPE",
    note: "",
    file: pdfFile,
  });
  expect(result.success).toBe(false);
});

test("accepts a structural asset shape (React Native image-picker file)", () => {
  const schema = buildRegisterPaymentSchema(60);
  const result = schema.safeParse({
    amount: "10",
    method: "YAPE",
    note: "",
    file: { name: "proof.png", type: "image/png", size: 2048 },
  });
  expect(result.success).toBe(true);
});

test("rejects primitive file values (false, 0, empty string)", () => {
  const schema = buildRegisterPaymentSchema(60);
  for (const file of [false, 0, ""]) {
    const result = schema.safeParse({
      amount: "10",
      method: "YAPE",
      note: "",
      file,
    });
    expect(result.success, `file=${String(file)}`).toBe(false);
  }
});

test("rejects file values with malformed optional fields", () => {
  const schema = buildRegisterPaymentSchema(60);
  const malformed = [
    { name: 5, type: "image/png", size: 2048 },
    { name: "proof.png", type: 123, size: 2048 },
    { name: "proof.png", type: "image/png", size: "big" },
    { uri: 7, type: "image/png", size: 2048 },
  ];
  for (const file of malformed) {
    const result = schema.safeParse({
      amount: "10",
      method: "YAPE",
      note: "",
      file,
    });
    expect(result.success, `malformed file`).toBe(false);
  }
});

test("rejects a file without a known size", () => {
  const schema = buildRegisterPaymentSchema(60);
  const result = schema.safeParse({
    amount: "10",
    method: "YAPE",
    note: "",
    file: { name: "proof.png", type: "image/png" },
  });
  expect(result.success).toBe(false);
});
