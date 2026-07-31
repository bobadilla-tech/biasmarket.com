# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Feature-sliced architecture

New feature work lives under `features/<name>/`, not directly in `app/` or a
growing `components/`/`lib/` grab-bag. Not every feature needs every folder —
build only what the feature actually uses:

```
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

**Forms rule** (once introduced — not installed yet, see roadmap below): new
forms use `react-hook-form` + `@hookform/resolvers/zod` + shadcn's
`components/ui/form.tsx`, not per-field `useState`.

**Shared async-state UI**: use `components/shared/{loading-state,error-state,empty-state}.tsx`
instead of ad hoc loading/error/empty markup.

**Known deprecated pattern — do not copy**: `lib/use-store.ts` hand-rolls a
cache (manual `useState`+`useEffect` fetch) and syncs other components via a
`window` `CustomEvent` broadcast (`broadcastStoreUpdate`). This predates
TanStack Query in this codebase and is slated for removal once `features/stores`
lands (see roadmap). Don't extend it or copy the `CustomEvent` pattern into
new code.

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
2. `features/notifications` — dedup `notifications-bell.tsx` + the notifications page onto a shared query, add mutations with `invalidateQueries`.
3. `features/auth` — first `react-hook-form` + `zodResolver` form (install `react-hook-form`, `@hookform/resolvers`, add shadcn `form.tsx` at this point).
4. create-store form — same RHF+Zod pattern plus multipart file upload.
5. `features/stores` — replace `lib/use-store.ts`'s hand-rolled cache + `CustomEvent` broadcast with `useQuery`/`invalidateQueries`, keeping its public return shape stable for existing call sites.
6. products/settings/orders pages — largest, highest-risk; migrate only once the pattern is proven across steps 2-5.
