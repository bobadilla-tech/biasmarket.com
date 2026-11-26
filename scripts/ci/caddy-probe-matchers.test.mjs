import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const caddyfile = readFileSync(
  new URL("../../infra/vps/Caddyfile", import.meta.url),
  "utf8",
);

test("Caddy rejects the Next.js middleware probe header", () => {
  assert.match(
    caddyfile,
    /@nextMiddlewareProbe header x-middleware-subrequest \*/,
  );
});

test("Caddy rejects only the cachefn server-action probe", () => {
  assert.match(caddyfile, /@nextActionProbe header next-action cachefn/);
  assert.doesNotMatch(caddyfile, /header next-action \*/);
});
