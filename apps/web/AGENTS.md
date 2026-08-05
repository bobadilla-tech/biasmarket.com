# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may
all differ from your training data. Read the relevant guide in
`node_modules/next/dist/docs/` before writing any code. Heed deprecation
notices.

# Feature-sliced architecture

New feature work lives under `features/<name>/`, not directly in `app/` or a
growing `components/`/`lib/` grab-bag. Not every feature needs every folder —
build only what the feature actually uses:

```text
features/<name>/
  schemas/    zod schemas — the runtime contract, source of truth for types (z.infer)
  api/        thin wrappers, one object export per feature (e.g. accountApi.confirm(...));
              over lib/api.ts's apiFetch + schema.parse(data) by default. A migrated
              feature (see the OpenAPI note below) has no api/ folder at all —
              queries/mutations call the generated `apiClient.<tag>.*` client from
              lib/api-client.ts directly, except multipart upload calls, which stay
              on apiFetch/raw fetch. See the OpenAPI note below for the current
              list of migrated features
  queries/    TanStack Query useQuery hooks, own the query key
  mutations/  TanStack Query useMutation hooks, invalidate on success
  components/ presentational components specific to this feature
  index.ts    barrel export
```

`features/account/` is the reference implementation — copy its shape (schema →
api → query → component) for new features rather than inventing a new layout.

**Data fetching rule**: new pages/components that fetch data use TanStack Query
via a feature's `queries/`, not a raw `useEffect`+`useState` triad.
`lib/api.ts`'s `apiFetch` is not being replaced — it's still the transport
underneath every feature `api/` layer, it's just no longer called directly from
components.

**Validation rule**: for features still on `apiFetch`, API responses are
validated with zod at the `api/` boundary (`schema.parse(data)`, throwing — a
schema mismatch is a real bug and should surface through the same error channel
as a network failure, not be silently swallowed by `safeParse`). A migrated
feature (generated Orval fetch client, exported as `apiClient` — see the OpenAPI
note below) drops response-shape zod for plain pass-through reads instead — see
that note for why and where the line is.

**Forms rule**: new forms use `react-hook-form` + `@hookform/resolvers/zod`, not
per-field `useState`. There is no shadcn `components/ui/form.tsx` — the `form`
registry item resolves empty for this project's `base-nova` style (Base UI
backend, not Radix; shadcn hasn't shipped a Base-UI-flavored form wrapper).
`features/auth/components/login-form.tsx` is the reference: `useForm`

- `zodResolver`, plain `register()` on existing inputs, per-field errors from
  `formState.errors`, and `setError("root", ...)` for submit-level failures
  (e.g. wrong credentials) instead of a separate `useState<string | null>`.

**Shared async-state UI**: use
`components/shared/{loading-state,error-state,empty-state}.tsx` instead of ad
hoc loading/error/empty markup.

**`lib/use-store.ts`**: thin compatibility re-export of `features/stores`'s
`useDashboardStore` (as `useStore`) — the real implementation is TanStack Query,
no more hand-rolled cache or `CustomEvent` broadcast. Kept as a re-export only
so the many existing dashboard pages importing from this path don't all need
touching in one change; new code should import
`useDashboardStore`/`DashboardStore` from `@/features/stores` directly. Local
optimistic updates after a mutation (e.g. settings saves) go through
`useUpdateDashboardStoreCache()` (`queryClient.setQueryData`), not a `window`
event — see `settings/page.tsx`'s `updateStoreCache` calls for the pattern.

**`packages/types` (`@biasmarket/types`)**: generates a real SDK client from
`apps/api/openapi.json` via [Orval](https://orval.dev) (see the OpenAPI note
below) — one grouped namespace per migrated tag, plus `configureApiClient` and
the re-exported response/request DTO types. Still not for hand-populated
feature-local types — those belong in `features/<name>/schemas/`.

**OpenAPI-generated client**: landed 2026-08-04, reworked the same day after
review (see `docs/plans/2026-08-04-nestjs-openapi-client-generation-plan.md` and
`docs/plans/2026-08-04-typed-sdk-client-followups.md` for the full history — a
first pass generated a raw `openapi-fetch` client that turned out to need _more_
hand-written wiring per call site than the `apiFetch` pattern it replaced; this
section describes the redo, not that first pass). `collections` was the pilot
feature; `products` (money fields + 2 upload endpoints) migrated next per
`docs/plans/2026-08-04-orval-client-rollout-plan.md`'s Batch 1, closing that
plan's money/upload proof-of-pattern gate. See that doc's "Batch 1 execution
notes" for what came up migrating a module with more than one response shape
(`create()` vs. `findAll()`/`findOne()`) and multipart endpoints. Batch 2
(`categories`, `notifications`, `contact`, `suggestions`, `sections`) followed
the same recipe — see that doc's "Batch 2 execution notes" for a new `@ApiQuery`
pattern needed for `Notifications.findAll`'s query-string filters (no prior
example in this repo) and an e2e-parallelism gotcha with better-auth's rate
limiter (`vitest.config.e2e.ts` now sets `fileParallelism: false` because of it
— every e2e spec signs up its own user, and running them in parallel trips
better-auth's rate limiter). Batch 3 (`DeliveryConfig`/`PublicDeliveryConfig`,
`PaymentConfig`/`PublicPaymentConfig`, `PickupPoints`/`PublicPickupPoints`,
`Stores`/`MyStores`) followed next per
`docs/plans/2026-08-05-orval-rollout-batches-3-6-plan.md` — see that doc's
"Batch 3 execution notes" for what came up: a real `FindAllParams` naming
collision between `Notifications` and `PaymentConfig` (fixed once, in
`orval.config.ts`'s `operationName`, not per-tag), `Stores`' deeply-nested
`findPublicBySlug` join DTO, and a genuine pre-existing app bug
(`DELETE /stores/:storeId` 400s for every store, not just ones with real data)
found and documented, not fixed, while giving that endpoint a real response DTO.

`apps/api` emits `openapi.json` (`@nestjs/swagger` + a standalone
`PluginMetadataGenerator` script, since the Nest build's SWC builder doesn't run
the swagger CLI plugin). `packages/types/orval.config.ts` runs
[Orval](https://orval.dev) against it (`client: "fetch"`, `mode:
"tags-split"`)
with a custom `http.ts` mutator every generated method calls through — this is
the one place that does what `apiFetch`/`collections.api.ts` used to repeat per
call site: resolve `credentials: "include"`, and throw on a non-2xx response
using the backend's `message` field (with an optional per-call
`fallbackErrorMessage`, same string clients pass to `apiFetch` today). Net
effect: a generated method's real signature is
`(storeId, ..., options?) => Promise<T>` — no `{ data, error }` tuple, no
per-call `if (error) throw`, no manually-templated path string, no explicit
return-type annotation needed to dodge a narrowing bug (all three were real
complaints about the first-pass `openapi-fetch` version — see the follow-up
doc's "What we learned"). `apps/web/lib/api-client.ts` calls
`configureApiClient({ baseUrl })` once (same `INTERNAL_API_URL`/
`NEXT_PUBLIC_API_URL` resolution `lib/api.ts`'s `apiFetch` always used) and
re-exports each migrated tag as a property of a single `apiClient` object —
`queries/`/`mutations/` call `apiClient.collections.findAll(storeId)` etc.
directly; there is no `features/collections/api/` folder at all anymore.

Both `apps/api/openapi.json` and `packages/types/generated/**` are **committed
to git, not build-generated** — unchanged from the original decision (kept
`web`'s build/typecheck independent of `apps/api`, no turbo cross-package build
step, no live app boot needed in CI). After changing a migrated feature's
backend response DTOs, regenerate by hand and commit the diff:
`pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types generate`.

**Orval config notes, for whoever adds the next tag:** `orval.config.ts`'s
`input.filters` only includes tags whose controller already has real response
DTOs — currently `Collections`, `Products`, `Categories`, `Notifications`,
`Contact`, `Suggestions`, `StoreSections`, `DeliveryConfig`,
`PublicDeliveryConfig`, `PaymentConfig`, `PublicPaymentConfig`, `PickupPoints`,
`PublicPickupPoints`, `Stores`, and `MyStores`. Generating a tag whose responses
are still untyped Prisma results produces anonymous `{ [key: string]: unknown }`
placeholder schema types keyed by the (post-`operationName`-override) shortened
method name, and those collide across unrelated controllers in the single shared
`api.schemas.ts` file (every controller's `findAll` fighting over one
`FindAll200Item` type) — add a tag here only once its controller has real
response DTOs, not just because the tag exists in the spec. Two
`CustomerAuthController` endpoints (`changePassword`, `logout`) are missing
their `slug` path param in the emitted spec — a real, pre-existing `apps/api`
Swagger-annotation gap, unrelated to collections and out of scope for this
change — which is why `input.unsafeDisableValidation: true` is set (Orval's
validator hard-fails the _entire_ build over those two operations, even with
`CustomerAuth` excluded from `filters.tags`, since validation runs before
filtering). `scripts/fix-esm-extensions.mjs` postprocesses Orval's output
because Orval has no option to emit `.js` extensions on relative imports, which
this package's NodeNext module resolution requires — run automatically as part
of `generate`, not a separate manual step.

**`operationName`'s `[methodName, typeName]` array form (added in Batch 3):**
Orval derives every internally-generated type name (a query-param'd method's
`<Method>Params`, mainly) from the _second_ element of the tuple returned by
`operationName`, independent of the first element (the actual generated
function's name). Two different tags each naming a query-param'd method
`findAll` (`Notifications`, `PaymentConfig`) collided on one shared
`FindAllParams` type the moment both were generated together — a real
`TS2300: Duplicate identifier`, not hypothetical. Fixed once, in
`orval.config.ts`, by returning `[methodName, operation.operationId]` instead of
a bare string — the method name stays short and clean per tag, the type name is
the already-globally-unique raw operationId (`PaymentConfigController_findAll`).
This resolved the collision for every existing and future tag at once; no
per-tag workaround needed going forward.

**TanStack Query hook generation: decided against, for now.** Orval (and
hey-api, which was also spiked) can generate `useQuery`/`useMutation` hooks
directly from operations, which would additionally shrink `queries/`/
`mutations/`. Not adopted, because a spike of Orval's `@orval/query` output
showed two real problems for this repo: it wraps responses in a
`{ data, status, headers }` envelope (a worse, not better, shape than the plain
`Promise<T>` the plain `fetch` client gives), and its `useQuery`/ `useMutation`
classification has to be told which operations are queries — naively applied, it
generated a `useQuery` hook for a `POST` create endpoint. More fundamentally,
this repo's hand-written hooks already carry real business logic a generic
generator has no way to produce — per-store query keys (`collectionsKeys`),
`invalidateQueries` call graphs, and feature-specific flows like
`features/orders`'s optimistic-update/undo timer — so hand-written
`queries/`/`mutations/` calling the generated SDK client directly (as described
above) stays the convention. Revisit only if a future session finds a generator
whose hook shape doesn't have these problems, not by default.

Response-shape zod schemas are dropped for migrated features doing plain
pass-through reads (see `features/collections/schemas/collection.schema.ts` —
`Collection`/`CollectionProduct` are now type aliases onto the generated
`CollectionWithProductsResponseDto`/`CollectionProductWithProductResponseDto`,
not `z.object()` + `.parse()`): for these plain pass-through reads, the fetch
layer does no response validation at all (only 2xx paths are typed by the
OpenAPI generation — see the plan doc's Phase 3 scope note), so the guarantee
these types carry is the server's documented contract, not a runtime check —
re-adding zod here would just re-check the same contract, still without catching
a live mismatch the type system already assumes away. zod stays for genuine
client-side logic — request/form validation (`createCollectionSchema`, still
`z.object()` + `zodResolver`) and any derived parsing/coercion a feature does on
top of the raw response (e.g. `useCreateCollection` turning an empty-string
`description` into `undefined` before calling `apiClient.collections.create`).
Apply this same split to each feature as it migrates, not a blanket
drop-all-response-zod change in one PR.

Migrated so far: `collections`, `products`, `categories`, `notifications`,
`contact`, `suggestions`, `sections` (`StoreSections` tag), `store-settings`'s
delivery/payment/pickup-point sections plus its profile/appearance/stock-alert
saves (`DeliveryConfig`, `PaymentConfig`, `PickupPoints`, and the relevant slice
of `Stores`), `checkout`'s public delivery/payment/pickup-point reads
(`PublicDeliveryConfig`, `PublicPaymentConfig`, `PublicPickupPoints` — the rest
of `checkout.api.ts`, the actual `Checkout` tag, is still on `apiFetch`, Batch
4), `stores` + `admin-stores` (`Stores`/`MyStores`), and `discovery`'s
featured-stores/store-directory reads (the rest of `discovery.api.ts`,
`ProductSearch`, is still on `apiFetch`, Batch 6). Everything else's `api/*.ts`
stays on `apiFetch` + zod until its backend controller gets the same
response-DTO treatment (see the rollout plan doc's "Suggested batches" for the
order). Error responses are also explicitly out of scope for the generated
client (see the plan doc's Phase 3 note) — the mutator's defensive
`message`-field parsing and `fallbackErrorMessage` stay the pattern for error
paths even in migrated features.

## Feature-specific patterns worth knowing

Every major dashboard page (`products`, `settings`, `orders`, plus `account`,
`notifications`, `auth`, `stores`) is migrated to the `features/<name>/` shape
above; `app/**/page.tsx` files are composition only. A few features have
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

New feature work should follow the `features/<name>/` shape already established
(see `features/account/` as the reference implementation above), not add a new
layout.
