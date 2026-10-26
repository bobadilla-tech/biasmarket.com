import { expect, test } from "vitest";
import { classifyAuthError } from "./auth-error";

test.each([
  ["account_not_linked", "existingAccount"],
  ["access_denied", "cancelled"],
  ["state_mismatch", "expired"],
  ["please_restart_the_process", "expired"],
  ["unable_to_link_account", "googleProblem"],
  ["email_not_found", "googleProblem"],
  ["internal_server_error", "generic"],
])("maps %s to the %s screen", (code, kind) => {
  expect(classifyAuthError(code)).toBe(kind);
});

test("normalises casing and separators", () => {
  expect(classifyAuthError("Account Not Linked")).toBe("existingAccount");
  expect(classifyAuthError(" ACCESS-DENIED ")).toBe("cancelled");
});

test("falls back to the generic screen for unknown, empty or missing codes", () => {
  expect(classifyAuthError("totally_new_error")).toBe("generic");
  expect(classifyAuthError("")).toBe("generic");
  expect(classifyAuthError(undefined)).toBe("generic");
});
