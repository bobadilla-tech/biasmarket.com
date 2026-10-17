// Node preload (`node --import scripts/ci/google-stub.mjs apps/api/dist/main.js`)
// that answers Google's OAuth token endpoint inside the CI web E2E stack, so
// the buyer "Guardar con Google" claim can run end to end without Google.
//
// Inert unless E2E_GOOGLE_STUB=1; web-e2e.sh sets that on the API process only.
// It wraps `globalThis.fetch`: a POST to the token endpoint whose `code`
// starts with `e2e-` gets an unsigned id_token back, anything else goes to the
// real fetch untouched. `sub`/`email` come from the code
// (`e2e-<runid>-<n>` -> `e2e-<runid>-<n>@example.test`), so every test picks
// its own identity and never collides.
//
// Why this is enough: buyer-google-oauth.ts (`exchangeBuyerGoogleCode`)
// checks the id_token's claims only (iss, aud === GOOGLE_CLIENT_ID, exp in
// seconds, sub, email, email_verified). If it ever starts verifying signatures
// or JWKS, the flows fail loudly: update the token built here to match.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CODE_PREFIX = "e2e-";

const b64url = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

export function createStubFetch(realFetch, env = process.env) {
  return async function stubFetch(input, init) {
    const url =
      typeof input === "string" ? input : (input?.url ?? String(input));
    if (url !== TOKEN_URL || init?.method !== "POST") {
      return realFetch(input, init);
    }
    const form = new URLSearchParams(String(init.body ?? ""));
    const code = form.get("code") ?? "";
    if (!code.startsWith(CODE_PREFIX)) return realFetch(input, init);

    const claims = {
      iss: "https://accounts.google.com",
      aud: env.GOOGLE_CLIENT_ID,
      sub: code,
      email: `${code}@example.test`,
      email_verified: true,
      name: "E2E Buyer",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const idToken = `${b64url({ alg: "none" })}.${b64url(claims)}.`;
    return new Response(JSON.stringify({ id_token: idToken }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

if (process.env.E2E_GOOGLE_STUB === "1") {
  globalThis.fetch = createStubFetch(globalThis.fetch.bind(globalThis));
}
