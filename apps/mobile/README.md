# Bias Market Mobile

Expo Router app for Bias Market, managed in the root pnpm workspace.

Start the Expo Go development server from the repository root:

```bash
pnpm turbo run dev --filter=mobile
```

Scan the QR code with Expo Go on an Android device. Routes live in `src/app/`.

The discover screen shows featured stores, recent products, and the public store
directory. Search supports product name and category filters, loads additional
results as you scroll, and opens the public product detail with its variants.
Catalog requests are public and work without a buyer session.

The API base defaults to `https://api.biasmarket.com/api`. Set
`EXPO_PUBLIC_API_URL` to a complete API base URL (including `/api`) when using a
development server.

Buyer sessions are stored in Expo SecureStore. Login uses a store slug, phone,
and password. Account setup uses the confirmation token from the buyer's
invitation, then signs in with the phone and password to establish the native
session. A successful login survives app restarts; logout removes the stored
bearer token and store context.

The buyer cart is stored locally with AsyncStorage. Each store has a separate
cart key, matching the web storefront's per-store cart behavior. Quantity and
currency calculations live in `@biasmarket/utils/cart`, shared with the web
cart so the two clients use the same rules.

Buyer authentication uses Expo SecureStore. Login and invitation-based account
setup support English and Spanish using the shared `packages/i18n` catalogs;
the account screen includes the language selector.
