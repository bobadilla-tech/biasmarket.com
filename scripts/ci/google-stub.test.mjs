import assert from "node:assert/strict";
import { test } from "node:test";

test("without E2E_GOOGLE_STUB=1 importing the preload leaves fetch alone", async () => {
  delete process.env.E2E_GOOGLE_STUB;
  const before = globalThis.fetch;
  await import("./google-stub.mjs");
  assert.equal(globalThis.fetch, before);
});

test("anything that is not an e2e- token request goes to the real fetch", async () => {
  const { createStubFetch } = await import("./google-stub.mjs");
  const calls = [];
  const real = async (input, init) => {
    calls.push([input, init]);
    return new Response("real");
  };
  const stub = createStubFetch(real, { GOOGLE_CLIENT_ID: "x" });
  const body = (code) => new URLSearchParams({ code });

  await stub("https://example.com/a", { method: "GET" });
  await stub("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: body("real-google-code"),
  });
  assert.equal(calls.length, 2);

  const res = await stub("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: body("e2e-run-1"),
  });
  assert.equal(calls.length, 2);
  const { id_token } = await res.json();
  const claims = JSON.parse(
    Buffer.from(id_token.split(".")[1], "base64url").toString(),
  );
  assert.equal(claims.email, "e2e-run-1@example.test");
  assert.equal(claims.aud, "x");
});
