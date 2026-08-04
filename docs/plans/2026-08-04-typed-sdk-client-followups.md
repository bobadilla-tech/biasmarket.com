# Typed API client ergonomics — follow-up to the OpenAPI codegen plan

Forward-looking proposal, not yet executed. Written for a future session to
pick up — research only happened in the session that wrote this doc, no code
changed. Follows on from
[`2026-08-04-nestjs-openapi-client-generation-plan.md`](2026-08-04-nestjs-openapi-client-generation-plan.md)
(Phases 0–3 landed same day) — read that doc first, especially its "Phase 2/3
execution notes" section.

## Context

After Phase 3 landed (`apps/web/features/collections/api/collections.api.ts`
rewritten against a generated `openapi-fetch` client), the user reviewed the
result and pushed back: it doesn't look like a win. Quoting the ask directly —
the goal was to get rid of `features/<name>/api/*.ts` wrapper files, and
instead there's *more* hand-written wiring per endpoint than before, not less.

Concretely, this is what `collectionsApi.list` looks like post-migration:

```ts
async list(storeId: string, fallbackErrorMessage?: string): Promise<Collection[]> {
  const { data, error } = await apiClient.GET(
    "/stores/{storeId}/collections",
    { params: { path: { storeId } } },
  );
  if (error) throw new Error(errorMessage(error, fallbackErrorMessage));
  return data;
},
```

Compare to what it replaced:

```ts
async list(storeId: string, fallbackErrorMessage?: string) {
  const data = await apiFetch(`/stores/${storeId}/collections`, {}, fallbackErrorMessage);
  return collectionListSchema.parse(data);
},
```

Roughly the same line count, and the new version needs an explicit
`Promise<Collection[]>` return-type annotation to avoid a real bug (see
"What we learned" below) that the old version didn't have. Every method in
the file repeats the same `params: { path: {...} }` + `if (error) throw`
shape. What the user actually expected was something more like:

```ts
apiClient.collections.findAll(storeId);
apiClient.stores.getById(id);
```

— a generated SDK with resource-grouped, named methods that hide the raw
path string and centralize error handling, so a feature's `api/` file either
shrinks to nothing or disappears (queries/mutations call the SDK directly).
`openapi-fetch` (what Phase 2 adopted) is a deliberately thin, low-level
client — it gives real type safety but none of that ergonomic win. That's a
tool-choice gap, not a bug in what got built; this doc is about closing it.

## What we learned (Phase 0–3, relevant to this decision)

- **Tag-based grouping is already free.** `apps/api`'s committed
  `openapi.json` already has every operation tagged by controller name —
  `@nestjs/swagger`'s `DocumentBuilder` infers tags from the controller class
  by default, no `@ApiTags()` decorators needed. Confirmed by inspecting the
  committed spec: 25 distinct tags (`Collections`, `Stores`, `Products`, …),
  one per controller. Any SDK-generation tool that groups by tag will produce
  sensible resource buckets (`sdk.collections.*`, `sdk.stores.*`) with zero
  backend changes required first.
- **The `{ data, error }` destructuring pattern has a real footgun.** Without
  an explicit return-type annotation on the wrapping method, TypeScript's
  narrowing of `data` after `if (error) throw` doesn't reliably propagate
  through the destructured binding across the `async function` boundary —
  it silently degraded to an effectively-`any` return type, which then
  surfaced three files downstream as `implicit any` on `.map()` in two
  dashboard pages, not as an error at the call site itself. See the other
  plan doc's Phase 2/3 execution notes for the full story. Any replacement
  approach should either avoid this pattern (e.g. a generated method that
  already returns `Promise<T>` and throws internally, no `{data,error}`
  destructuring exposed to call sites) or centralize the unwrap-and-throw
  logic in exactly one place instead of repeating it per method.
- **Committing generated output (not wiring it into the build graph) is a
  separate, already-settled decision** — see the other doc's Phase 2/3 notes.
  Keep that regardless of what's decided here: whatever tool/approach wins
  below should be run as a one-off script whose output gets committed, not a
  turbo task or CI step.
- **Only `collections` is migrated.** Nothing else depends on today's
  `openapi-fetch`-direct approach yet, so redoing it costs one file, not
  twenty.

## Options to evaluate (spike — nothing here is decided)

1. **[`@hey-api/openapi-ts`](https://heyapi.dev)** — actively maintained,
   plugin-based generator. The `@hey-api/client-fetch` plugin produces a
   grouped SDK (methods per tag, e.g. `collectionsService.findAll(...)`);
   there's also a `@tanstack/react-query` plugin that can generate
   query/mutation hooks directly from operations, which — if adopted —
   could shrink `api/` **and** `queries/`/`mutations/` for straightforward
   CRUD, not just `api/`. That's a bigger convention change than this doc
   is scoped to decide (see Non-goals).
2. **[Orval](https://orval.dev)** — mature, widely used, similar shape:
   per-tag grouped clients, optional TanStack Query hook generation (fetch or
   axios mutator). Worth comparing DX/output readability against hey-api
   head-to-head rather than picking blind — they solve the same problem with
   different config philosophies.
3. **Custom lightweight generator (in-house)** — a small script
   (roughly 100–200 lines) that reads the committed `openapi.json`, groups
   operations by `tags[0]`, and emits a typed object wrapping the *existing*
   `openapi-fetch` client with one named method per `operationId`, plus a
   single centralized error-throwing `client.use()` middleware (`openapi-fetch`
   supports response middleware — an `onResponse` hook that throws on
   non-2xx would kill the per-call `if (error) throw` line everywhere, even
   independent of grouping). Lowest new-dependency risk, full control, but
   it's a generator this repo would own and maintain forever solving a
   problem the ecosystem already has mature tools for — treat as the
   fallback if 1/2 don't fit cleanly, not the default pick.
4. **Middleware-only, keep the flat client** — the cheapest partial fix:
   don't adopt any grouping/codegen tool, just add a `client.use()` middleware
   to the existing `apiClient` (`apps/web/lib/api-client.ts`) that throws on
   non-2xx responses. Every call site drops its `if (error) throw
   new Error(errorMessage(...))` line, but call sites still say
   `apiClient.GET("/stores/{storeId}/collections", {...})` — doesn't address
   the `apiClient.stores.getById(id)` ask directly. Reasonable as a quick
   stopgap while 1–3 are evaluated, or layered underneath whichever option
   wins (all three still benefit from not repeating error-handling per call).

## Suggested next steps (for the session that picks this up)

1. Spike options 1 and 2 against the **already-committed**
   `apps/api/openapi.json` — no backend changes needed to try either one.
   Generate for just the `Collections` tag and compare, for each:
   - generated code shape/readability, and how it'd read in
     `collections.api.ts`'s place
   - new dependency footprint (bundle size, transitive deps, how actively
     maintained)
   - whether it runs cleanly as a one-off script whose output can be
     committed (matches the Phase 2/3 "commit, don't build-step" decision),
     or whether it wants to be a live build/watch process
   - whether the react-query-hook generation (if the tool offers it) looks
     worth adopting now or is better left for a separate decision later
2. Pick one (or decide none fit and fall back to option 3/4).
3. Redo `collections.api.ts` against the chosen approach — small, isolated,
   cheap to redo again if the first pick turns out wrong.
4. Only after that's proven: update `apps/web/AGENTS.md`'s `api/` convention
   description and the OpenAPI note to match reality, and revisit Phase 4
   rollout planning (the other doc) with the real pattern in hand instead of
   the one this doc is walking back.

## Non-goals

- **Not deciding on query/mutation hook generation in this doc.** Whether
  `queries/`/`mutations/` stay hand-written TanStack Query hooks (current
  convention) or get generated alongside the SDK client is a bigger call
  than "which client library" — flag it as an open question in the spike,
  don't fold it into the SDK-client decision by default.
- **Not touching any module other than `collections`** until a new pattern
  is chosen and proven there first.
- **Not reopening the "commit vs. build-step" decision** from the other
  plan doc's Phase 2/3 notes — keep generated output committed regardless of
  which tool/approach is chosen here.
- **Not a backend change.** Tag-based grouping already works with zero
  `apps/api` changes (see "What we learned" above) — this is entirely an
  `apps/web` / `packages/types` concern.

## Open questions

1. hey-api vs. Orval vs. custom, for this repo's size and the team's
   maintenance appetite for an added codegen dependency?
2. Should query/mutation hook generation be adopted alongside whichever SDK
   client is chosen, or kept hand-written even after this change?
3. If the chosen tool's output is large or noisy relative to
   `openapi-typescript`'s current `generated/schema.d.ts`, does that change
   the "commit generated files" call from Phase 2/3 — e.g. would a build
   step become preferable at that point?
