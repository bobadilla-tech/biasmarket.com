import { expect, test } from "vitest";
import { packedPhotoSrc, safeTrackingUrl } from "./shipping-links";

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
