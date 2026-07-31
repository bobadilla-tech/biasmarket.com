# Feature-sliced architecture migration for apps/web (phase 1: infra + reference feature)

## Context

`apps/web` had no data-fetching or forms convention: 15+ files repeated a
`useEffect` + 3x`useState` (`data`/`loading`/`error`) triad around
`lib/api.ts`'s `apiFetch`, some pages bypassed even that helper with raw
`fetch(`, and DTO-shaped interfaces were hand-duplicated per file with no
canonical source (`Product` defined independently 4 times with different shapes,
`Order` with a stray typo `interface OrderItemRow {Upload: any`,
`NotificationItem`/`DeliveryMethod`/ `PickupPoint`/`Category`/`Variant` each
duplicated at least twice). `lib/use-store.ts` hand-rolled a cache with a
`window` `CustomEvent` broadcast to sync components — a manual workaround for
the lack of a shared query cache. No shared loading/error/empty component
existed despite the ad hoc pattern (`{tCommon("loading")}`,
`error && <p className="text-sm text-red-500">`) repeating 13+ times each.
shadcn/ui was installed but adoption was inconsistent, and forms were all
per-field `useState` with no schema validation.

Asked for: move `apps/web` toward a feature-sliced architecture
(`features/<name>/{schemas,api,queries,mutations,components}`) backed by
TanStack Query + Zod + react-hook-form, without a risky big-bang rewrite — prove
the pattern on one real page first rather than installing every library and
migrating everything at once. Also asked to investigate generating a typed API
client from the NestJS backend's OpenAPI spec.

Two `Explore` passes (one on `apps/web`, one on `apps/api`) and one `Plan` pass
verified the actual repo state before any code was written — see "What changed"
and "Investigated, deferred" below for what that turned up.

## What changed

**Dependencies** (`apps/web/package.json`): added `@tanstack/react-query` and
`zod`. Deliberately did **not** add `react-hook-form`/`@hookform/resolvers` yet
— no form is migrated in this phase, so there's nothing for them to do.

**shadcn primitive**: `components/ui/alert.tsx` added via
`pnpm dlx shadcn@latest add alert` (matches the existing `base-nova` style).
`form.tsx` deferred to the future RHF PR.

**Query provider**: new `apps/web/app/[locale]/query-provider.tsx`
(`"use client"`, lazy `useState(() => new QueryClient(...))`,
`staleTime: 30_000` default), wired into `apps/web/app/[locale]/layout.tsx`
nested inside the existing `<NextIntlClientProvider>`. Root layout stays an
async Server Component — only the new file is a client boundary. Confirmed
against `node_modules/next/dist/docs` that this is still the correct Next 16
pattern (the version installed here has enough breaking changes vs. training
data that `apps/web/AGENTS.md` explicitly warns not to assume anything about
it).

**Shared async-state components** — `apps/web/components/shared/`:
`loading-state.tsx` (wraps the previously-unused-outside-the-sidebar
`components/ui/skeleton.tsx`, `variant="page" | "inline"`), `error-state.tsx`
(wraps the new `components/ui/alert.tsx`, `variant="destructive"`, optional
`retry` callback + `retryLabel`), `empty-state.tsx` (icon + message + optional
action, extracted from the notifications page's existing inline pattern rather
than invented).

**Reference feature — `apps/web/features/account/`**: the canonical four-layer
shape every future feature should copy —

- `schemas/confirm-result.schema.ts` —
  `accountOrderSchema`/`confirmResultSchema`, mirrors the exact fields read from
  `GET /stores/:slug/account/confirm` (verified by reading the real endpoint's
  controller + the original page's hand-written interfaces before writing the
  schema).
- `api/account.api.ts` — `accountApi.confirm(slug, token)` wraps `apiFetch`,
  returns `confirmResultSchema.parse(data)`. `apiFetch` is not being replaced;
  it's still the transport underneath every feature `api/` layer.
- `queries/use-confirm-account.ts` — `useConfirmAccount(slug, token)`,
  `useQuery` with `enabled: !!token`, replacing the manual "no token" branch.
- `components/account-confirm-view.tsx` — the presentational JSX extracted from
  the original page body, unchanged visually (same copy/translation keys, same
  order list/status-label logic).
- `index.ts` barrel.

`.parse()` (throwing) was chosen over `.safeParse()` deliberately — a schema
mismatch is a real bug and should surface through the same `error` channel as a
network failure, not be silently swallowed.

**Migrated page**:
`app/[locale]/(storefront)/store/[slug]/account/confirm/page.tsx` now calls
`useConfirmAccount` and branches on `isPending`/`isError`/`data` instead of
owning 3 `useState`s + a `useEffect`. Chosen as the first migration because it's
a pure read, single consumer, no mutation — the lowest-risk page in the app, and
it happens to be the exact page the original migration brief used as its own
worked example.

**Tests**: `features/account/schemas/confirm-result.schema.test.ts` (valid
payload parses; missing field and bad enum value both throw),
`features/account/api/account.api.test.ts` (mocks `lib/api`'s `apiFetch` via
`vi.mock`, asserts the exact URL/query-string called and that a schema-invalid
response rejects), and a new shared test util
`apps/web/test-utils/render-with-providers.tsx` (RTL `render` wrapped in a fresh
per-test `QueryClientProvider` + the existing `NextIntlClientProvider` +
`@biasmarket/i18n`'s `getMessages`, following the shape already used in
`__tests__/page.test.tsx`) for every future feature-component test to reuse.

**Docs**:

- `apps/web/AGENTS.md` — appended a new section (left the existing 3-line
  Next-16 warning untouched): the `features/<name>/` layout and that not every
  feature needs every folder (cited in advance for the future `features/auth`,
  which will be schema+component only, no `api/`, since
  `authClient.signIn.email` isn't `apiFetch`-based); the
  data-fetching/validation/forms rules; the shared async-state components; an
  explicit note that `lib/use-store.ts`'s `CustomEvent` broadcast is a
  known-deprecated pattern not to copy; an explicit note that `packages/types`
  is intentionally dead and reserved for a future OpenAPI-codegen initiative,
  not to be hand-populated with feature-local zod-inferred types; and the staged
  roadmap (see "Follow-up" below).
- Root `claude.md` — new `### Web structure (apps/web)` subsection under
  Architecture, mirroring the existing `### API structure` one, pointing at
  `apps/web/AGENTS.md` for the full convention.

## Investigated, deferred

**OpenAPI-generated TypeScript client** (the brief's preferred long-term flow:
NestJS → OpenAPI spec → generated client → TanStack Query hooks). Read
`apps/api/src/main.ts`, every `modules/*/dto/*.ts`, and `nest-cli.json` directly
rather than assuming. Findings:

- `@nestjs/swagger` is not installed; nothing decorates any controller.
- Nest builds via SWC (`nest-cli.json`: `builder: "swc"`, `typeCheck: false`).
  The `@nestjs/swagger` CLI plugin (which auto-infers `@ApiProperty` from
  types/class-validator decorators) requires the tsc-based Nest compiler plugin
  pipeline and doesn't run under SWC — adopting it means either changing the
  build pipeline or hand-annotating every DTO field.
- Request DTOs are well-decorated with `class-validator`/`class-transformer` —
  good raw material for request-schema generation.
- Controller **response** types are almost entirely untyped — handlers return
  whatever the Prisma-backed service returns, no `Promise<T>` annotations, no
  response DTO classes, no `@ApiResponse`, across all ~15 controllers. Even a
  fully wired-up `@nestjs/swagger` would produce `any`-shaped responses until a
  separate effort adds response DTOs everywhere.
- Auth is cookie-session (`better-auth`, `credentials: 'include'`, no bearer
  token) — a detail any future generated client's config needs to get right, and
  one that isn't natively representable as a simple bearer `securityScheme`.

**Conclusion**: not a quick win, scoped as a separate later initiative, not part
of this migration. Hand-written `api/*.ts` wrappers + Zod `.parse()` (as built
in `features/account/api/account.api.ts`) are the interim — and, per the
"response types would still be `any` until the DTO gap closes" point above,
likely **permanent, defense-in-depth** — substitute. This is written into
`apps/web/AGENTS.md` explicitly so it isn't silently treated as throwaway.

**`packages/types`** (`@biasmarket/types`): confirmed a 13-line dead stub with
zero import sites in either app, already stale vs. real DTO shapes. Left
untouched rather than deleted or repurposed — deleting it touches
`turbo.json`/CI path-filters/both `package.json`s for no functional gain, and
it's the structurally correct eventual home for OpenAPI-generated types if that
initiative ever lands. Documented in `AGENTS.md` so nobody "helpfully" starts
hand-populating it with the feature-local Zod types instead.

**`lib/use-store.ts`**: confirmed as a hand-rolled cache + `CustomEvent`
broadcast consumed by every dashboard route (high fan-out). Not touched this
phase — migrating it safely means either updating every consumer or keeping its
`{ store, storeId, slug, loading, error }` return shape stable across an
internal swap to `useQuery`, which is its own PR-sized effort best done once the
query+mutation+invalidation pattern is proven elsewhere first.

**Not migrated this phase** (by design — "don't install everything upfront"):
notifications (bell + page currently duplicate-fetch overlapping data — good
future dedup/mutation-invalidation demo), any form (login, create-store — RHF
not installed yet), `products`/`settings`/`orders` pages (1683/1128/1080 lines,
largest/highest-risk, deliberately last).

## Verification

- `pnpm --filter web exec vitest run` — 6/6 passing (3 new schema tests, 2 new
  api-mock tests, 1 pre-existing `__tests__/page.test.tsx`, unaffected).
- `pnpm turbo run typecheck --filter=web` — clean (`tsc --noEmit`).
- `pnpm turbo run build --filter=web` — succeeds,
  `/[locale]/store/[slug]/account/confirm` present in the route output,
  confirming the new client-provider nesting in the root layout doesn't break
  SSR/static generation for any route.
- `pnpm turbo run lint --filter=web` — no-op; `apps/web/package.json` has no
  `lint` script at all. Pre-existing gap, not introduced by or fixed in this
  change.
- **Not done**: a live browser smoke test of the confirm page against a real
  seeded store/token (would need `pnpm --filter api dev` +
  `pnpm --filter web dev`
  - a valid order/token in the local DB). Build + typecheck + tests are the only
    confirmation so far — flagged rather than claimed as fully verified.

## Follow-up

Recorded in `apps/web/AGENTS.md`'s roadmap section as the staged plan for
subsequent PRs, in this order:

1. `features/notifications` — dedupe
   `components/dashboard/notifications-bell.tsx`
   - the notifications page onto one shared
     `useNotifications(storeId, archived)` query, add
     `mark-read`/`mark-all-read`/`archive` mutations with `invalidateQueries`,
     replacing both components' manual `ignore`-flag race guards.
2. `features/auth` (login form) — first `react-hook-form` + `zodResolver`
   reference; install `react-hook-form`/`@hookform/resolvers` and add shadcn
   `form.tsx` at this point, not before. Chosen ahead of create-store as the
   first RHF example specifically because it has no file-upload/derived-state
   complexity.
3. create-store form — same RHF+Zod pattern plus multipart file upload
   (`logoFile`), scoped separately since file upload doesn't flow through
   `zodResolver` as cleanly as JSON fields.
4. `features/stores` — replace `lib/use-store.ts`'s hand-rolled cache +
   `CustomEvent` broadcast with `useQuery`/`invalidateQueries`, keeping its
   public return shape stable so existing dashboard call sites don't need
   touching. Prerequisite for a clean products/settings/orders migration later
   (all three consume `useStore()` today).
5. products/settings/orders — largest, highest-risk pages; migrate only once the
   pattern is proven across steps 1-4 above.
6. Revisit OpenAPI-generated client only if/when `apps/api` adds
   `@nestjs/swagger` (needs the SWC-builder conflict resolved) and response DTOs
   across its controllers — not assumed to happen automatically.
