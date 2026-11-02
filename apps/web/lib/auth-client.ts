import { createAuthClient } from "better-auth/react";
import type { BetterAuthOptions } from "better-auth";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";

type RegisterAuthOptions = BetterAuthOptions & {
  user: {
    additionalFields: {
      countryCode: { type: "string"; required: false };
      uiRegister: { type: "string"; required: false };
    };
  };
};

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  plugins: [adminClient(), inferAdditionalFields<RegisterAuthOptions>()],
});
