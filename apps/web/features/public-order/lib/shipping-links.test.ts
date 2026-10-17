import { afterEach, expect, test, vi } from "vitest";
import {
  packedPhotoSrc,
  publicApiBase,
  safeTrackingUrl,
} from "./shipping-links";

afterEach(() => {
  vi.unstubAllEnvs();
});

test("only http(s) tracking URLs become links", () => {
  expect(safeTrackingUrl("https://olva.example/t/1")).toBe(
    "https://olva.example/t/1",
  );
  expect(safeTrackingUrl("http://olva.example/t/1")).toBe(
    "http://olva.example/t/1",
  );
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html,<b>x</b>",
    "ftp://x.example",
    "not a url",
    "",
    null,
    undefined,
  ]) {
    expect(safeTrackingUrl(bad as string | null | undefined)).toBeNull();
  }
});

test("the photo src is the token stream route, with the token encoded", () => {
  expect(packedPhotoSrc("a/b c")).toMatch(
    /\/api\/public\/orders\/a%2Fb%20c\/packed-photo$/,
  );
});

test("publicApiBase prefers the public URL, then the internal one", () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
  vi.stubEnv("INTERNAL_API_URL", "http://api:3000");
  expect(publicApiBase()).toBe("https://api.example.com");

  vi.stubEnv("NEXT_PUBLIC_API_URL", undefined as unknown as string);
  expect(publicApiBase()).toBe("http://api:3000");
});

test("publicApiBase falls back to localhost only in development", () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", undefined as unknown as string);
  vi.stubEnv("INTERNAL_API_URL", undefined as unknown as string);

  vi.stubEnv("NODE_ENV", "development");
  expect(publicApiBase()).toBe("http://localhost:3000");

  vi.stubEnv("NODE_ENV", "production");
  expect(publicApiBase()).toBe("");
});
