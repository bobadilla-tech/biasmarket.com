# Bias Market Mobile

Expo Router app for Bias Market, managed in the root pnpm workspace.

Start the Expo Go development server from the repository root:

```bash
pnpm turbo run dev --filter=mobile
```

Scan the QR code with Expo Go on an Android device. Routes live in `src/app/`
(Expo Router file-based routing):

| Route                            | File                                  | Purpose                             |
| -------------------------------- | ------------------------------------- | ----------------------------------- |
| `/`                              | `index.tsx`                           | Discover: featured stores, products |
| `/search`                        | `search.tsx`                          | Product search with filters         |
| `/product/:storeSlug/:productId` | `product/[storeSlug]/[productId].tsx` | Public product detail and variants  |
| `/cart/:storeSlug`               | `cart/[storeSlug].tsx`                | Per-store local cart                |
| `/login`                         | `login.tsx`                           | Buyer login                         |
| `/register`                      | `register.tsx`                        | Invitation-based account setup      |
| `/account`                       | `account.tsx`                         | Buyer session summary, language     |

Checkout, order submission, and order tracking are not built in the app: the
cart screen is local-only and no screen calls an order endpoint.

The discover screen shows featured stores, recent products, and the public store
directory. Search supports product name and category filters, loads additional
results as you scroll, and opens the public product detail with its variants.
Catalog requests are public and work without a buyer session.

The API base defaults to `https://api.biasmarket.com/api`. Set
`EXPO_PUBLIC_API_URL` to a complete API base URL (including `/api`) when using a
development server.

The buyer cart is stored locally with AsyncStorage. Each store has a separate
cart key, matching the web storefront's per-store cart behavior. Quantity and
currency calculations live in `@biasmarket/utils/cart`, shared with the web cart
so the two clients use the same rules.

Buyer authentication uses Expo SecureStore. Login and invitation-based account
setup support English and Spanish using the shared `packages/i18n` catalogs; the
account screen includes the language selector.

## Shared with web

The app consumes workspace packages instead of duplicating logic:
`@biasmarket/validation` (login and registration schemas),
`@biasmarket/design-tokens` (palette source used by `tailwind.config.ts`),
`@biasmarket/query` (`createQueryClient`), `@biasmarket/i18n/mobile`
(`getMobileMessages`, the `mobile` namespace, via
`src/i18n/mobile-i18n.tsx`), `@biasmarket/utils/cart`, and `@biasmarket/types`
(the generated API client). See [docs/core/i18n.md](../../docs/core/i18n.md) and
[docs/core/mobile-release.md](../../docs/core/mobile-release.md).
