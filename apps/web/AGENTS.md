# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Feature-sliced architecture

New feature work lives under `features/<name>/`, not directly in `app/` or a
growing `components/`/`lib/` grab-bag. Not every feature needs every folder —
build only what the feature actually uses:

```text
features/<name>/
  schemas/    zod schemas — the runtime contract, source of truth for types (z.infer)
  api/        thin wrappers over lib/api.ts's apiFetch, one object export per feature
              (e.g. accountApi.confirm(...)), each call ends in schema.parse(data)
  queries/    TanStack Query useQuery hooks, own the query key
  mutations/  TanStack Query useMutation hooks, invalidate on success
  components/ presentational components specific to this feature
  index.ts    barrel export
```

`features/account/` is the reference implementation — copy its shape
(schema → api → query → component) for new features rather than inventing a
new layout.

**Data fetching rule**: new pages/components that fetch data use TanStack
Query via a feature's `queries/`, not a raw `useEffect`+`useState` triad.
`lib/api.ts`'s `apiFetch` is not being replaced — it's still the transport
underneath every feature `api/` layer, it's just no longer called directly
from components.

**Validation rule**: API responses are validated with zod at the `api/`
boundary (`schema.parse(data)`, throwing — a schema mismatch is a real bug and
should surface through the same error channel as a network failure, not be
silently swallowed by `safeParse`). This stays the standing convention even if
a generated OpenAPI client is introduced later — see the OpenAPI note below.

**Forms rule**: new forms use `react-hook-form` + `@hookform/resolvers/zod`,
not per-field `useState`. There is no shadcn `components/ui/form.tsx` — the
`form` registry item resolves empty for this project's `base-nova` style
(Base UI backend, not Radix; shadcn hasn't shipped a Base-UI-flavored form
wrapper). `features/auth/components/login-form.tsx` is the reference: `useForm`
+ `zodResolver`, plain `register()` on existing inputs, per-field errors from
`formState.errors`, and `setError("root", ...)` for submit-level failures
(e.g. wrong credentials) instead of a separate `useState<string | null>`.

**Shared async-state UI**: use `components/shared/{loading-state,error-state,empty-state}.tsx`
instead of ad hoc loading/error/empty markup.

**`lib/use-store.ts`**: thin compatibility re-export of
`features/stores`'s `useDashboardStore` (as `useStore`) — the real
implementation is TanStack Query, no more hand-rolled cache or `CustomEvent`
broadcast. Kept as a re-export only so the many existing dashboard pages
importing from this path don't all need touching in one change; new code
should import `useDashboardStore`/`DashboardStore` from `@/features/stores`
directly. Local optimistic updates after a mutation (e.g. settings saves) go
through `useUpdateDashboardStoreCache()` (`queryClient.setQueryData`), not a
`window` event — see `settings/page.tsx`'s `updateStoreCache` calls for the
pattern.

**`packages/types` (`@biasmarket/types`)**: currently unused/dead — do not
hand-populate it with feature-local zod-inferred types. It's reserved as the
eventual home for OpenAPI-generated types if/when that initiative happens (see
below). Feature types belong in `features/<name>/schemas/`.

**OpenAPI-generated client**: investigated and deliberately deferred.
`apps/api` has no `@nestjs/swagger`, and its Nest build uses the SWC builder
(`typeCheck: false` in `nest-cli.json`), which the swagger CLI plugin doesn't
support — adopting it needs either a builder change or hand-annotating every
DTO, plus a separate effort to add response DTOs across controllers (most
handlers currently return untyped/inferred data with no `@ApiResponse`). Until
that lands, hand-written `api/*.ts` wrappers + zod schemas are the standing
convention, not a stopgap to be ripped out later.

## Migration roadmap (not all built yet)

1. ~~Infra (TanStack Query provider, zod, shared async-state components) + `features/account` reference~~ — done.
2. ~~`features/notifications` — dedup `notifications-bell.tsx` + the notifications page onto a shared query, add mutations with `invalidateQueries`~~ — done.
3. ~~`features/auth` — first `react-hook-form` + `zodResolver` form~~ — done (no shadcn `form.tsx`, see Forms rule above).
4. ~~create-store form — same RHF+Zod pattern plus multipart file upload~~ — done (`features/stores/components/create-store-form.tsx`; `MyStoresList` split out as a separate component in the same feature).
5. ~~`features/stores` — replace `lib/use-store.ts`'s hand-rolled cache + `CustomEvent` broadcast with `useQuery`/`setQueryData`~~ — done. `lib/use-store.ts` is now a thin re-export; `settings/page.tsx`'s four `broadcastStoreUpdate` call sites were switched to `useUpdateDashboardStoreCache()` (the only other consumer of the old broadcast function) — that was the one small, surgical touch to `settings/page.tsx` in this step, not a full migration of that page.
6. products/settings/orders pages — largest, highest-risk; migrate only once the pattern is proven across steps 2-5.
   - ~~`settings/page.tsx`~~ — done. Split into `features/store-settings/` with one section component per card (profile, appearance, payments, delivery, defaults, notifications/stock-alerts), each with its own schema/api/query-or-mutation; `settings/page.tsx` itself is now ~75 lines of composition. `SectionCard`/`Field`/`ToggleRow`/`useSavedFlash` (the 1.8s "Saved" flash, now per-mutation instead of one shared page enum) live in `features/store-settings/components/section-primitives.tsx`. The 2 permanently-disabled notification toggles (`orderDelivered`/`weeklySummary`) stay local-only state — they don't call any API, same as before.
   - ~~`products/page.tsx` + `products/[productId]/page.tsx`~~ — done. Split into `features/products/` (schemas/lib/api/queries/mutations/components per the usual shape); both pages are now composition only. Scalar product fields (name/description/price/currency/stock/categoryId) use `react-hook-form` + `zodResolver`; the option-builder and generated variant-combination matrix stay local `useState`/`useMemo` (a derived read model regenerated from options, not user-editable rows — not forced into `useFieldArray`, per the migration plan). `useUpdateProduct`'s variant diff/upsert loop was changed from sequential-await to `Promise.allSettled` with aggregated error reporting, and the delete pass only runs once every upsert has succeeded — a deliberate behavior change from the old fail-fast-and-leave-it-half-migrated version (see the doc comment on `features/products/mutations/use-update-product.ts`). Not live-smoke-tested (no seeded DB access in this session) — only typecheck/test/build were verified.
   - ~~`orders/page.tsx`~~ — done. Split into `features/orders/`; the page is now composition only. `useOptimisticStatusChange` wraps the review/advance mutations with the delayed-commit/undo UX (apply the status change to the orders query cache immediately via `queryClient.setQueryData`, hold the real mutation behind an 8s `setTimeout` + sonner undo toast — TanStack Query's `onMutate` optimistic pattern has no "delay the commit" primitive, so this is a plain timer wrapper, same shape as the page-local version it replaces). The sensitive-transition path (rejecting a payment, advancing to `COMPLETED`) bypasses that hook entirely and calls the mutations directly from a confirm dialog, same as before — including preserving the pre-existing quirk that the detail sheet's footer "advance" button also bypasses both the undo flow *and* the sensitive-transition confirm dialog (only the row-level button in the table goes through `SENSITIVE_FULFILLMENT`). `RegisterPaymentForm` is a new `react-hook-form` + `zodResolver` form with a schema built per-order (`buildRegisterPaymentSchema(pendingAmount)`) so amount/method/file validation mirrors the backend rather than only being caught after the round-trip. The stray `Upload: any` field on the old `OrderItemRow` type was dropped, and the dead `t("details.paymentHistory", { fallback: ... })` param was removed after confirming the real i18n key exists in both locales. The enabled-payment-methods lookup reuses `features/store-settings`'s `settingsApi` (`getEnabledPaymentMethods`, new) rather than a third independent wrapper around `GET .../payment-methods`. Not live-smoke-tested (no seeded DB access in this session) — only typecheck/test/build were verified.

All three pages in this step are now migrated — the feature-sliced migration covers every major dashboard page. This roadmap section has served its purpose; treat future page work as "follow the `features/<name>/` shape already established" rather than expecting this list to keep growing.
