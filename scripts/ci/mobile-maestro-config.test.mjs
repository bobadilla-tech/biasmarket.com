import assert from "node:assert/strict";
import test from "node:test";
import { escapeRegex, validateStagingApiUrl } from "./mobile-maestro-config.mjs";

test("escapes regex metacharacters for literal Maestro selectors", () => {
  const value = "Album (A+B) [v2].*? $^{}|\\";
  assert.equal(escapeRegex(value), "Album \\(A\\+B\\) \\[v2\\]\\.\\*\\? \\$\\^\\{\\}\\|\\\\");
});

test("accepts an absolute HTTPS staging API URL ending in /api", () => {
  assert.equal(
    validateStagingApiUrl("https://staging-api.example.test/api/").href,
    "https://staging-api.example.test/api/",
  );
});

test("rejects missing staging API URL configuration", () => {
  assert.throws(() => validateStagingApiUrl(undefined), /EXPO_PUBLIC_API_URL is required/);
  assert.throws(() => validateStagingApiUrl("  "), /EXPO_PUBLIC_API_URL is required/);
});

test("rejects invalid or unsafe staging API URLs", () => {
  for (const value of [
    "not a URL",
    "http://staging-api.example.test/api",
    "https://staging-api.example.test/v1",
    "https://user:password@staging-api.example.test/api",
    "https://staging-api.example.test/api?debug=true",
    "https://staging-api.example.test/api#fragment",
  ]) {
    assert.throws(() => validateStagingApiUrl(value), /absolute HTTPS URL ending in \/api/);
  }
});
