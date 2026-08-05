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
              on apiFetch/raw fetch. collections and products are migrated so far
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
feature (generated `openapi-fetch` client) drops response-shape zod for plain
pass-through reads instead — see the OpenAPI note below for why and where the
line is.

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
below) — one grouped namespace per migrated tag (`collections`, `products`),
plus `configureApiClient` and the re-exported response/request DTO types. Still
not for hand-populated feature-local types — those belong in
`features/<name>/schemas/`.

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
better-auth's rate limiter).

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

**Orval config notes, for whoever adds the next tag in Phase 4:**
`orval.config.ts`'s `input.filters` only includes tags whose controller already
has real response DTOs — currently `Collections` and `Products`. Generating a
tag whose responses are still untyped Prisma results produces anonymous
`{ [key: string]: unknown }` placeholder schema types keyed by the
(post-`operationName`-override) shortened method name, and those collide across
unrelated controllers in the single shared `api.schemas.ts` file (every
controller's `findAll` fighting over one `FindAll200Item` type) — add a tag here
only once its controller has real response DTOs, not just because the tag exists
in the spec. Two `CustomerAuthController` endpoints (`changePassword`, `logout`)
are missing their `slug` path param in the emitted spec — a real, pre-existing
`apps/api` Swagger-annotation gap, unrelated to collections and out of scope for
this change — which is why `input.unsafeDisableValidation: true` is set (Orval's
validator hard-fails the _entire_ build over those two operations, even with
`CustomerAuth` excluded from `filters.tags`, since validation runs before
filtering). `scripts/fix-esm-extensions.mjs` postprocesses Orval's output
because Orval has no option to emit `.js` extensions on relative imports, which
this package's NodeNext module resolution requires — run automatically as part
of `generate`, not a separate manual step.

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
not `z.object()` + `.parse()`): the backend's real response DTO classes are the
runtime guarantee now, and re-validating with zod client-side would just be
checking the same contract twice. zod stays for genuine client-side logic —
request/form validation (`createCollectionSchema`, still `z.object()` +
`zodResolver`) and any derived parsing/coercion a feature does on top of the raw
response (e.g. `useCreateCollection` turning an empty-string `description` into
`undefined` before calling `apiClient.collections.create`). Apply this same
split to each feature as it migrates, not a blanket drop-all-response-zod change
in one PR.

Not yet migrated: everything except `collections` and `products`. `apps/api`'s
response DTOs only cover those two modules so far — every other feature's
`api/*.ts` stays on `apiFetch` + zod until its backend controller gets the same
response-DTO treatment (see the rollout plan doc's "Suggested batches" for the
order — `products` closed the original money/upload proof-of-pattern gate, Batch
2 onward is small CRUD modules). Error responses are also explicitly out of
scope for the generated client (see the plan doc's Phase 3 note) — the mutator's
defensive `message`-field parsing and `fallbackErrorMessage` stay the pattern
for error paths even in migrated features.

## Migration roadmap (not all built yet)

1. ~~Infra (TanStack Query provider, zod, shared async-state components) +
   `features/account` reference~~ — done.
2. ~~`features/notifications` — dedup `notifications-bell.tsx` + the
   notifications page onto a shared query, add mutations with
   `invalidateQueries`~~ — done.
3. ~~`features/auth` — first `react-hook-form` + `zodResolver` form~~ — done (no
   shadcn `form.tsx`, see Forms rule above).
4. ~~create-store form — same RHF+Zod pattern plus multipart file upload~~ —
   done (`features/stores/components/create-store-form.tsx`; `MyStoresList`
   split out as a separate component in the same feature).
5. ~~`features/stores` — replace `lib/use-store.ts`'s hand-rolled cache +
   `CustomEvent` broadcast with `useQuery`/`setQueryData`~~ — done.
   `lib/use-store.ts` is now a thin re-export; `settings/page.tsx`'s four
   `broadcastStoreUpdate` call sites were switched to
   `useUpdateDashboardStoreCache()` (the only other consumer of the old
   broadcast function) — that was the one small, surgical touch to
   `settings/page.tsx` in this step, not a full migration of that page.
6. products/settings/orders pages — largest, highest-risk; migrate only once the
   pattern is proven across steps 2-5.
   - ~~`settings/page.tsx`~~ — done. Split into `features/store-settings/` with
     one section component per card (profile, appearance, payments, delivery,
     defaults, notifications/stock-alerts), each with its own
     schema/api/query-or-mutation; `settings/page.tsx` itself is now ~75 lines
     of composition. `SectionCard`/`Field`/`ToggleRow`/`useSavedFlash` (the 1.8s
     "Saved" flash, now per-mutation instead of one shared page enum) live in
     `features/store-settings/components/section-primitives.tsx`. The 2
     permanently-disabled notification toggles
     (`orderDelivered`/`weeklySummary`) stay local-only state — they don't call
     any API, same as before.
   - ~~`products/page.tsx` + `products/[productId]/page.tsx`~~ — done. Split
     into `features/products/` (schemas/lib/api/queries/mutations/components per
     the usual shape); both pages are now composition only. Scalar product
     fields (name/description/price/currency/stock/categoryId) use
     `react-hook-form` + `zodResolver`; the option-builder and generated
     variant-combination matrix stay local `useState`/`useMemo` (a derived read
     model regenerated from options, not user-editable rows — not forced into
     `useFieldArray`, per the migration plan). `useUpdateProduct`'s variant
     diff/upsert loop was changed from sequential-await to `Promise.allSettled`
     with aggregated error reporting, and the delete pass only runs once every
     upsert has succeeded — a deliberate behavior change from the old
     fail-fast-and-leave-it-half-migrated version (see the doc comment on
     `features/products/mutations/use-update-product.ts`). Not live-smoke-tested
     (no seeded DB access in this session) — only typecheck/test/build were
     verified. Later, separately (2026-08-05): `features/products`' `api/` layer
     (excluding `categories.api.ts`, a separate tag not yet migrated) was itself
     migrated from this step's `apiFetch` + zod pattern onto the generated Orval
     client — see the OpenAPI note above and
     `docs/plans/2026-08-04-orval-client-rollout-plan.md`'s Batch 1 execution
     notes.
   - ~~`orders/page.tsx`~~ — done. Split into `features/orders/`; the page is
     now composition only. `useOptimisticStatusChange` wraps the review/advance
     mutations with the delayed-commit/undo UX (apply the status change to the
     orders query cache immediately via `queryClient.setQueryData`, hold the
     real mutation behind an 8s `setTimeout` + sonner undo toast — TanStack
     Query's `onMutate` optimistic pattern has no "delay the commit" primitive,
     so this is a plain timer wrapper, same shape as the page-local version it
     replaces). The sensitive-transition path (rejecting a payment, advancing to
     `COMPLETED`) bypasses that hook entirely and calls the mutations directly
     from a confirm dialog, same as before — including preserving the
     pre-existing quirk that the detail sheet's footer "advance" button also
     bypasses both the undo flow _and_ the sensitive-transition confirm dialog
     (only the row-level button in the table goes through
     `SENSITIVE_FULFILLMENT`). `RegisterPaymentForm` is a new
     `react-hook-form` + `zodResolver` form with a schema built per-order
     (`buildRegisterPaymentSchema(pendingAmount)`) so amount/method/file
     validation mirrors the backend rather than only being caught after the
     round-trip. The stray `Upload: any` field on the old `OrderItemRow` type
     was dropped, and the dead `t("details.paymentHistory", { fallback: ... })`
     param was removed after confirming the real i18n key exists in both
     locales. The enabled-payment-methods lookup reuses
     `features/store-settings`'s `settingsApi` (`getEnabledPaymentMethods`, new)
     rather than a third independent wrapper around `GET .../payment-methods`.
     Not live-smoke-tested (no seeded DB access in this session) — only
     typecheck/test/build were verified.

All three pages in this step are now migrated — the feature-sliced migration
covers every major dashboard page. This roadmap section has served its purpose;
treat future page work as "follow the `features/<name>/` shape already
established" rather than expecting this list to keep growing.
