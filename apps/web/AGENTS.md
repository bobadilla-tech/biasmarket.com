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
              over lib/api.ts's apiFetch + schema.parse(data) by default, or over
              lib/api-client.ts's generated openapi-fetch client for a migrated
              feature (see the OpenAPI note below) — collections is the only one so far
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
schema mismatch is a real bug and should surface through the same error
channel as a network failure, not be silently swallowed by `safeParse`). A
migrated feature (generated `openapi-fetch` client) drops response-shape zod
for plain pass-through reads instead — see the OpenAPI note below for why and
where the line is.

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

**`packages/types` (`@biasmarket/types`)**: holds `createApiClient`, an
`openapi-fetch` client factory typed from `apps/api/openapi.json` (see the
OpenAPI note below). Still not for hand-populated feature-local types —
those belong in `features/<name>/schemas/`.

**OpenAPI-generated client**: landed 2026-08-04, `collections` is the pilot
feature (see `docs/plans/2026-08-04-nestjs-openapi-client-generation-plan.md`).
`apps/api` now emits `openapi.json` (`@nestjs/swagger` + a standalone
`PluginMetadataGenerator` script, since the Nest build's SWC builder still
doesn't run the swagger CLI plugin) and `packages/types/generated/schema.d.ts`
is `openapi-typescript`'s output — `apps/web/lib/api-client.ts` wraps it with
the same `credentials: "include"` + `INTERNAL_API_URL`/`NEXT_PUBLIC_API_URL`
base-URL logic `lib/api.ts`'s `apiFetch` always used. **Both generated files
are committed to git, not build-generated** — a deliberate choice to keep
`web`'s build/typecheck independent of `apps/api` (no turbo cross-package
build step, no live app boot needed in CI). After changing a migrated
feature's backend response DTOs, regenerate by hand and commit the diff:
`pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types generate`.

Response-shape zod schemas are dropped for migrated features doing plain
pass-through reads (see `features/collections/schemas/collection.schema.ts` —
`Collection`/`CollectionProduct` are now type aliases onto
`components["schemas"][...]`, not `z.object()` + `.parse()`): the backend's
real response DTO classes are the runtime guarantee now, and re-validating
with zod client-side would just be checking the same contract twice. zod
stays for genuine client-side logic — request/form validation
(`createCollectionSchema`, still `z.object()` + `zodResolver`) and any
derived parsing/coercion a feature does on top of the raw response. Apply
this same split to each feature as it migrates, not a blanket
drop-all-response-zod change in one PR.

Not yet migrated: everything except `collections`. `apps/api`'s response DTOs
only cover that one module so far — every other feature's `api/*.ts` stays on
`apiFetch` + zod until its backend controller gets the same response-DTO
treatment (see the plan doc's Phase 1 gate: a money-bearing module and a
multipart-upload module still need to prove the pattern before wider
rollout). Error responses are also explicitly out of scope for the generated
client (see the plan doc's Phase 3 note) — `apiFetch`-style defensive
`res.json()` parsing and `fallbackErrorMessage` stay the pattern for error
paths even in migrated features.

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
     verified.
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
