# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may
all differ from your training data. Read the relevant guide in
`node_modules/next/dist/docs/` before writing any code. Heed deprecation
notices.

# Feature-sliced architecture

New feature work lives under `features/<name>/`, not directly in `app/` or a
growing `components/`/`lib/` grab-bag. Not every feature needs every folder;
build only what the feature actually uses:

```text
features/<name>/
  schemas/    zod schemas: the runtime contract, source of truth for types (z.infer)
  api/        thin wrappers, one object export per feature; only kept where a
              feature composes multiple client calls, stores composite flows, or
              does multipart/custom-header calls (see the carve-outs below).
              Otherwise there is no api/ folder: queries/mutations call the
              generated `apiClient.<tag>.*` client from lib/api-client.ts directly
  queries/    TanStack Query useQuery hooks, own the query key
  mutations/  TanStack Query useMutation hooks, invalidate on success
  components/ presentational components specific to this feature
  index.ts    barrel export
```

`features/products` is the reference implementation (it has all five folders):
copy its shape (schema, api, query, mutation, component) for new features
rather than inventing a new layout. `features/collections` is the example of a
feature with no `api/` folder.

**Accepted extras.** Some features also have `lib/` (feature-local pure helpers
and constants), `hooks/` (non-query React hooks, e.g. `features/public-order`),
and `server.ts` (server-component data access, e.g. `features/blog`,
`features/discovery`). These are fine when the code does not fit `queries/` or
`mutations/`.

**Thin features.** Not every directory is a full slice. `features/landing`,
`features/contact`, `features/cart`, and `features/account` are thin
(components, or one query/mutation). `features/storefront` has only
`components/` and no `index.ts`. Do not add empty folders to match the template.

**Data fetching rule**: new pages/components that fetch data use TanStack Query
via a feature's `queries/`, not a raw `useEffect`+`useState` triad. All data
access goes through the generated `apiClient` (see the OpenAPI note below);
there is no hand-written `apiFetch` wrapper.

**Validation rule**: request/form shapes are validated with zod at the schema
boundary (`schema.parse` / `zodResolver`). API responses are typed by the
generated Orval client and are not runtime-validated for plain pass-through
reads: the guarantee is the server's documented contract, not a runtime check.
zod stays for client-side logic (request/form validation, and parsing or
coercion a feature does on top of a response, for example turning an empty
`description` into `undefined` before a create call). Response types for plain
reads are aliases onto the generated DTOs (see
`features/collections/schemas/collection.schema.ts`).

**Forms rule**: new forms use `react-hook-form` + `@hookform/resolvers/zod`, not
per-field `useState`. There is no shadcn `components/ui/form.tsx`: the `form`
registry item resolves empty for this project's `base-nova` style (Base UI
backend, not Radix). `features/auth/components/login-form.tsx` is the reference:
`useForm` + `zodResolver`, plain `register()` on existing inputs, per-field
errors from `formState.errors`, and `setError("root", ...)` for submit-level
failures instead of a separate `useState<string | null>`.

**Shared async-state UI**: use
`components/shared/{loading-state,error-state,empty-state}.tsx` instead of ad
hoc loading/error/empty markup.

**`lib/use-store.ts`**: thin compatibility re-export of `features/stores`'s
`useDashboardStore` (as `useStore`). New code imports
`useDashboardStore`/`DashboardStore` from `@/features/stores` directly. Local
optimistic updates after a mutation go through `useUpdateDashboardStoreCache()`
(`queryClient.setQueryData`), not a `window` event.

**`packages/types` (`@biasmarket/types`)**: the generated SDK client (see the
OpenAPI note below), plus `configureApiClient` and the re-exported
request/response DTO types. Not for hand-populated feature-local types; those
belong in `features/<name>/schemas/`.

## OpenAPI-generated client

`apps/api` emits `openapi.json` (`@nestjs/swagger` plus a standalone
`PluginMetadataGenerator` script, since the Nest build's SWC builder does not
run the swagger CLI plugin). `packages/types/orval.config.ts` runs
[Orval](https://orval.dev) against it (`client: "fetch"`, `mode: "tags-split"`)
with a custom `packages/types/http.ts` mutator that every generated method calls
through. That mutator is the one place that sets `credentials: "include"` and
throws on a non-2xx response using the backend's `message` field (with an
optional per-call `fallbackErrorMessage`). A generated method's signature is
`(storeId, ..., options?) => Promise<T>`: no `{ data, error }` tuple and no
hand-templated path. `apps/web/lib/api-client.ts` calls
`configureApiClient({ baseUrl })` once and re-exports each tag as a property of
a single `apiClient` object, so `queries/`/`mutations/` call
`apiClient.collections.findAll(storeId)` and similar directly.

Which tags are generated is controlled by `input.filters` in
`packages/types/orval.config.ts`; read that file rather than a list here. Add a
tag only once its controller has real response DTOs (untyped Prisma results
produce anonymous placeholder types that collide across controllers in the
shared `api.schemas.ts`). `operationName` there returns
`[methodName, operation.operationId]`: the method name stays short per tag while
the generated type name (for example `<Method>Params`) is globally unique.
`scripts/fix-esm-extensions.mjs` post-processes Orval's output to add the `.js`
extensions that NodeNext requires; `generate` runs it automatically.

Both `apps/api/openapi.json` and `packages/types/generated/**` are committed,
not build-generated (see the root `CLAUDE.md`). After changing a migrated
module's response DTOs, run
`pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types generate`
and commit the diff. Orval is pinned to an exact version because a different
version renames generated operations; CI's SDK drift check fails otherwise.

**`@Body()` DTO imports must be value imports.** Under the SWC build a
type-only import is erased before `emitDecoratorMetadata` runs, so
`@nestjs/swagger` has nothing to `$ref` and silently emits no `requestBody` for
that operation (the generated function then loses its `data` parameter). Any DTO
used as a `@Body()` parameter type is a real `import`, never `import type`. DTOs
used only as return-type annotations may be type imports.

**Do not generate TanStack Query hooks from Orval.** Its `@orval/query` output
wraps responses in a `{ data, status, headers }` envelope and needs each
operation classified as query or mutation. The hand-written hooks also carry
logic a generator cannot produce: per-store query keys, `invalidateQueries`
call graphs, and flows like the optimistic-update/undo timer in
`features/orders`. Keep hand-written `queries/`/`mutations/` over the generated
SDK client.

Error responses are outside the generated client's typing (only 2xx paths are
typed). Keep the mutator's `message`-field parsing and `fallbackErrorMessage`
for error paths.

## Raw `fetch`/`FormData` carve-outs

The generated client does not cover multipart bodies or calls that need custom
headers, so these `features/*/api/` files call `fetch` directly (found by
grepping `fetch(` and `FormData` in `apps/web/features`; re-run that grep when
this list may have changed):

- Multipart uploads: `products/api/products.api.ts` (images),
  `stores/api/stores.api.ts` (logo), `store-settings/api/settings.api.ts`
  (content image and banner/avatar uploads), `orders/api/orders.api.ts`
  (`registerPayment` and the shipping photo),
  `checkout/api/checkout.api.ts` (checkout submit with a payment proof),
  `customer-auth/api/order-payments.api.ts` (buyer proof for a store order), and
  `public-order/api/submit-proof.ts` (buyer proof via a public order link;
  `credentials: "omit"`, no custom headers so the browser skips a CORS
  preflight, throws `ApiError`).
- Custom headers: `assisted-orders/api/assisted-orders.api.ts` sends an
  `Idempotency-Key` header with a JSON body and handles the idempotent-replay
  response.
- Server components: `app/[locale]/(storefront)/store/[slug]/` `page.tsx` and
  `layout.tsx` (and `product/[productId]/page.tsx`) call `fetch` directly.
  `features/blog/server.ts` uses the Sanity client's `fetch`, not the API.

## Feature-specific patterns worth knowing

Dashboard pages follow the `features/<name>/` shape above; `app/**/page.tsx`
files are composition only. A few features have
non-obvious internal patterns worth knowing before touching them:

**`features/store-settings`**: one section component per settings card (profile,
appearance, payments, delivery, defaults, notifications/stock-alerts), each with
its own schema/api/query-or-mutation.
`SectionCard`/`Field`/`ToggleRow`/`useSavedFlash` (the 1.8s "Saved" flash,
per-mutation) live in `components/section-primitives.tsx`. The 2 notification
toggles `orderDelivered`/`weeklySummary` are permanently disabled and stay
local-only state — they don't call any API.

**`features/products`**: scalar fields
(name/description/price/currency/stock/categoryId) use `react-hook-form` +
`zodResolver`; the option-builder and generated variant-combination matrix stay
local `useState`/`useMemo` — it's a derived read model regenerated from options,
not user-editable rows, so it isn't forced into `useFieldArray`.
`useUpdateProduct`'s variant diff/upsert loop runs via `Promise.allSettled` with
aggregated error reporting, and the delete pass only runs once every upsert has
succeeded (a deliberate choice over failing fast and leaving things
half-migrated — see the doc comment on
`features/products/mutations/use-update-product.ts`).

**`features/orders`**: `useOptimisticStatusChange` wraps the review/advance
mutations with a delayed-commit/undo UX — it applies the status change to the
orders query cache immediately via `queryClient.setQueryData`, then holds the
real mutation behind an 8s `setTimeout` + sonner undo toast (TanStack Query's
`onMutate` optimistic pattern has no "delay the commit" primitive, so this is a
plain timer wrapper). The sensitive-transition path (rejecting a payment,
advancing to `COMPLETED`) bypasses that hook entirely and calls the mutations
directly from a confirm dialog. Known quirk: the order detail sheet's footer
"advance" button also bypasses both the undo flow _and_ the sensitive-transition
confirm dialog — only the row-level button in the table goes through
`SENSITIVE_FULFILLMENT`. `RegisterPaymentForm` builds its `zodResolver` schema
per-order (`buildRegisterPaymentSchema(pendingAmount)`) so amount/method/file
validation mirrors the backend instead of only being caught after the
round-trip. Its enabled-payment-methods lookup reuses
`features/store-settings`'s `settingsApi.getEnabledPaymentMethods` rather than a
separate wrapper around `GET .../payment-methods`.

## Related

- [`../../CLAUDE.md`](../../CLAUDE.md) — repo rules and commands
- [`../../docs/core/architecture.md`](../../docs/core/architecture.md) —
  Next.js architecture and multi-tenancy
- [`../../docs/core/i18n.md`](../../docs/core/i18n.md) — locale routing
