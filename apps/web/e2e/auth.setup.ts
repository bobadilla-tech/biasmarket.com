import { expect, test as setup } from "@playwright/test";
import {
  API_URL,
  SEED_SELLER,
  SELLER_STATE,
  WEB_URL,
} from "./flows/helpers/env";

// Logs the seeded seller in ONCE and saves the session for the flows project
// (better-auth rate-limits sign-in to 3 requests per 10 s). The API is called
// directly with the web origin, which better-auth checks against
// `trustedOrigins`; the cookie is host-scoped to 127.0.0.1, so it is sent to
// both the API (:3000) and the web app (:3001).
setup("log in the seeded seller", async ({ request }) => {
  const res = await request.post(`${API_URL}/api/auth/sign-in/email`, {
    headers: { Origin: WEB_URL },
    data: { email: SEED_SELLER.email, password: SEED_SELLER.password },
  });
  expect(
    res.ok(),
    `seed seller login failed (${res.status()}): has seed:base run?`,
  ).toBeTruthy();
  await request.storageState({ path: SELLER_STATE });
});
