# Typed API client ergonomics — follow-up to the OpenAPI codegen plan

**Executed 2026-08-04** (same day as the doc below, later session) — Orval was
picked over hey-api, `packages/types` regenerated with it, and
`features/collections` redone against the result. See "Execution notes" at the
bottom for what actually happened vs. this doc's spike plan; the short version
is the spike plan below was followed closely and its "suggested next steps" all
landed, but Orval needed more configuration than a default `npx` run to get
there (grouped classes require a custom `nesting` function; a plain, un-nested,
`Promise<T>`-returning signature needed the `fetch` client

- a custom mutator, not `@hey-api/client-fetch`'s `{data,error}` shape even with
  grouping).

The spike plan below (Phases 0–3) was executed the same day, per the "Executed
2026-08-04" note above — this section is kept as written (the original proposal)
rather than rewritten after the fact; see "Execution notes" at the bottom for
what actually happened vs. this plan. Follows on from
[`2026-08-04-nestjs-openapi-client-generation-plan.md`](2026-08-04-nestjs-openapi-client-generation-plan.md)
(that doc's own Phases 0–3 landed the same day too) — read that doc first,
especially its "Phase 2/3 execution notes" section.

## Context

After Phase 3 landed (`apps/web/features/collections/api/collections.api.ts`
rewritten against a generated `openapi-fetch` client), the user reviewed the
result and pushed back: it doesn't look like a win. Quoting the ask directly —
the goal was to get rid of `features/<name>/api/*.ts` wrapper files, and instead
there's _more_ hand-written wiring per endpoint than before, not less.

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
`Promise<Collection[]>` return-type annotation to avoid a real bug (see "What we
learned" below) that the old version didn't have. Every method in the file
repeats the same `params: { path: {...} }` + `if (error) throw` shape. What the
user actually expected was something more like:

```ts
apiClient.collections.findAll(storeId);
apiClient.stores.getById(id);
```

— a generated SDK with resource-grouped, named methods that hide the raw path
string and centralize error handling, so a feature's `api/` file either shrinks
to nothing or disappears (queries/mutations call the SDK directly).
`openapi-fetch` (what Phase 2 adopted) is a deliberately thin, low-level client
— it gives real type safety but none of that ergonomic win. That's a tool-choice
gap, not a bug in what got built; this doc is about closing it.

## What we learned (Phase 0–3, relevant to this decision)

- **Tag-based grouping is already free.** `apps/api`'s committed `openapi.json`
  already has every operation tagged by controller name — `@nestjs/swagger`'s
  `DocumentBuilder` infers tags from the controller class by default, no
  `@ApiTags()` decorators needed. Confirmed by inspecting the committed spec: 25
  distinct tags (`Collections`, `Stores`, `Products`, …), one per controller.
  Any SDK-generation tool that groups by tag will produce sensible resource
  buckets (`sdk.collections.*`, `sdk.stores.*`) with zero backend changes
  required first.
- **The `{ data, error }` destructuring pattern has a real footgun.** Without an
  explicit return-type annotation on the wrapping method, TypeScript's narrowing
  of `data` after `if (error) throw` doesn't reliably propagate through the
  destructured binding across the `async function` boundary — it silently
  degraded to an effectively-`any` return type, which then surfaced three files
  downstream as `implicit any` on `.map()` in two dashboard pages, not as an
  error at the call site itself. See the other plan doc's Phase 2/3 execution
  notes for the full story. Any replacement approach should either avoid this
  pattern (e.g. a generated method that already returns `Promise<T>` and throws
  internally, no `{data,error}` destructuring exposed to call sites) or
  centralize the unwrap-and-throw logic in exactly one place instead of
  repeating it per method.
- **Committing generated output (not wiring it into the build graph) is a
  separate, already-settled decision** — see the other doc's Phase 2/3 notes.
  Keep that regardless of what's decided here: whatever tool/approach wins below
  should be run as a one-off script whose output gets committed, not a turbo
  task or CI step.
- **Only `collections` is migrated.** Nothing else depends on today's
  `openapi-fetch`-direct approach yet, so redoing it costs one file, not twenty.

## Options to evaluate (spike — nothing here is decided)

1. **[`@hey-api/openapi-ts`](https://heyapi.dev)** — actively maintained,
   plugin-based generator. The `@hey-api/client-fetch` plugin produces a grouped
   SDK (methods per tag, e.g. `collectionsService.findAll(...)`); there's also a
   `@tanstack/react-query` plugin that can generate query/mutation hooks
   directly from operations, which — if adopted — could shrink `api/` **and**
   `queries/`/`mutations/` for straightforward CRUD, not just `api/`. That's a
   bigger convention change than this doc is scoped to decide (see Non-goals).
2. **[Orval](https://orval.dev)** — mature, widely used, similar shape: per-tag
   grouped clients, optional TanStack Query hook generation (fetch or axios
   mutator). Worth comparing DX/output readability against hey-api head-to-head
   rather than picking blind — they solve the same problem with different config
   philosophies.
3. **Custom lightweight generator (in-house)** — a small script (roughly 100–200
   lines) that reads the committed `openapi.json`, groups operations by
   `tags[0]`, and emits a typed object wrapping the _existing_ `openapi-fetch`
   client with one named method per `operationId`, plus a single centralized
   error-throwing `client.use()` middleware (`openapi-fetch` supports response
   middleware — an `onResponse` hook that throws on non-2xx would kill the
   per-call `if (error) throw` line everywhere, even independent of grouping).
   Lowest new-dependency risk, full control, but it's a generator this repo
   would own and maintain forever solving a problem the ecosystem already has
   mature tools for — treat as the fallback if 1/2 don't fit cleanly, not the
   default pick.
4. **Middleware-only, keep the flat client** — the cheapest partial fix: don't
   adopt any grouping/codegen tool, just add a `client.use()` middleware to the
   existing `apiClient` (`apps/web/lib/api-client.ts`) that throws on non-2xx
   responses. Every call site drops its
   `if (error) throw
   new Error(errorMessage(...))` line, but call sites still
   say `apiClient.GET("/stores/{storeId}/collections", {...})` — doesn't address
   the `apiClient.stores.getById(id)` ask directly. Reasonable as a quick
   stopgap while 1–3 are evaluated, or layered underneath whichever option wins
   (all three still benefit from not repeating error-handling per call).

## Suggested next steps (for the session that picks this up)

1. Spike options 1 and 2 against the **already-committed**
   `apps/api/openapi.json` — no backend changes needed to try either one.
   Generate for just the `Collections` tag and compare, for each:
   - generated code shape/readability, and how it'd read in
     `collections.api.ts`'s place
   - new dependency footprint (bundle size, transitive deps, how actively
     maintained)
   - whether it runs cleanly as a one-off script whose output can be committed
     (matches the Phase 2/3 "commit, don't build-step" decision), or whether it
     wants to be a live build/watch process
   - whether the react-query-hook generation (if the tool offers it) looks worth
     adopting now or is better left for a separate decision later
2. Pick one (or decide none fit and fall back to option 3/4).
3. Redo `collections.api.ts` against the chosen approach — small, isolated,
   cheap to redo again if the first pick turns out wrong.
4. Only after that's proven: update `apps/web/AGENTS.md`'s `api/` convention
   description and the OpenAPI note to match reality, and revisit Phase 4
   rollout planning (the other doc) with the real pattern in hand instead of the
   one this doc is walking back.

## Non-goals

- **Not deciding on query/mutation hook generation in this doc.** Whether
  `queries/`/`mutations/` stay hand-written TanStack Query hooks (current
  convention) or get generated alongside the SDK client is a bigger call than
  "which client library" — flag it as an open question in the spike, don't fold
  it into the SDK-client decision by default.
- **Not touching any module other than `collections`** until a new pattern is
  chosen and proven there first.
- **Not reopening the "commit vs. build-step" decision** from the other plan
  doc's Phase 2/3 notes — keep generated output committed regardless of which
  tool/approach is chosen here.
- **Not a backend change.** Tag-based grouping already works with zero
  `apps/api` changes (see "What we learned" above) — this is entirely an
  `apps/web` / `packages/types` concern.

## Open questions

1. hey-api vs. Orval vs. custom, for this repo's size and the team's maintenance
   appetite for an added codegen dependency?
2. Should query/mutation hook generation be adopted alongside whichever SDK
   client is chosen, or kept hand-written even after this change?
3. If the chosen tool's output is large or noisy relative to
   `openapi-typescript`'s current `generated/schema.d.ts`, does that change the
   "commit generated files" call from Phase 2/3 — e.g. would a build step become
   preferable at that point?

## Execution notes (2026-08-04)

Answering the three open questions above, in order: **Orval**, decided below;
**kept hand-written**, decided below; **no** — Orval's `tags-split` output for
one tag is ~230 lines across two files (`collections/
collections.ts` + a shared
`api.schemas.ts`), smaller and more readable than `openapi-typescript`'s old
`schema.d.ts`, so the commit-generated-files call stands unchanged.

### hey-api spike — what it actually produces

Spiked `@hey-api/openapi-ts@0.99.0` against the committed `openapi.json` (a
local copy, filtered to `Collections` via `input.filters.tags`). Findings, in
the order they came up:

- **It crashes outright under this repo's root `typescript@^7.0.2`**
  (`TypeError: Cannot read properties of undefined (reading 'AnyKeyword')` in
  its `ts.factory` usage) — the exact same TS7-vs-real-Compiler-API problem the
  other plan doc's Phase 2/3 notes describe for `openapi-typescript`. Fixed the
  same way: a scratch project with its own pinned `typescript@5.9.3`
  devDependency. Would have needed the same fix in `packages/types` had hey-api
  been chosen.
- **Default output is flat, ungrouped functions** —
  `collectionsControllerFindAll(options)`, not `sdk.collections.findAll()` —
  exactly the DX the follow-up doc's "What we learned" section already flagged
  `openapi-fetch` (Phase 2/3's actual pick) for. Getting grouped output at all
  requires the `@hey-api/sdk` plugin's `operations.strategy:
  "single"` **and**
  a hand-written `operations.nesting(operation)` function (there is no built-in
  "group by tag" preset) that returns `[operation.tags[0], methodName]` — the
  _last_ array element becomes the method name, so a `[tag]`-only nesting
  function produces working classes but numbered, collision-avoidance method
  names (`collections`, `collections2`, ... `collections7`); getting real method
  names (`findAll`, `create`, ...) needs the second element derived from
  `operation.operationId` (NestJS's own `CollectionsController_findAll` shape,
  split on `_`) — undocumented by example, found by logging the `operation`
  object's own keys from inside the config file.
- **Even with grouped classes and clean names, calls still take a single
  `options` bag** (`sdk.collections.findAll({ path: { storeId } } )`), not
  positional args — hey-api models every operation's parameters as one object
  because that's how OpenAPI naturally composes multiple param locations
  (path/query/body). No config was found to change this.
- **No clean way to make it throw by default.** The generated
  `RequestResult<Responses, unknown, ThrowOnError>` return type only narrows to
  the throwing/`Promise<T>`-like shape when a `<true>` type argument is passed
  at the _call site_ — a global runtime `throwOnError: true` on the client
  doesn't change the TS-side default (`ThrowOnError extends boolean = false`),
  so every single call site would need `sdk.collections.findAll<true>(...)` to
  get non-union typing. That reproduces exactly the class of footgun the other
  plan doc's Phase 2/3 notes already hit once (the
  `{ data, error }`-destructuring narrowing bug) — a mismatch between the
  runtime behavior and what the type says by default, easy to get wrong at any
  one of many call sites.

None of this is a bug in hey-api — it's a general-purpose, plugin-based tool
covering many client shapes (fetch/axios/Angular/etc.), and the above is all
reachable with enough custom configuration. But "enough custom configuration"
here meant a custom `nesting` function, a custom method-name derivation, and
still no path to a plain throwing `Promise<T>` signature without either a type
argument at every call site or a hand-written wrapper per method — which is the
exact boilerplate this whole effort exists to delete. Orval, below, produces the
target shape with far less configuration.

### Orval spike — what won

Same spike setup, `orval@8.23.0`, `client: "fetch"`, `mode: "tags-split"`.
Findings:

- **The plain `fetch` client already generates positional-arg,
  `Promise<T>`-returning functions** —
  `create(storeId, dto, options?):
  Promise<CollectionResponseDto>` — because
  Orval's fetch/axios clients were never built around an `openapi-fetch`-style
  single-options-bag design the way hey-api's client plugins are. This is the
  biggest reason it won: it's the _default_ shape, not something reached via
  custom config.
- **A custom `override.mutator`** (a plain function Orval's generated code calls
  through instead of `fetch` directly) **centralizes exactly the logic the old
  `collections.api.ts` repeated per method** — base URL,
  `credentials: "include"`, and throwing on non-2xx. Because the mutator's
  second parameter type is entirely ours to declare (Orval just types the
  generated code's trailing `options` param as
  `Parameters<typeof customFetch>[1]`), extending `RequestInit` with an optional
  `fallbackErrorMessage` field was enough to keep the exact per-call-site
  "custom message if the backend didn't send one" behavior the old code had,
  fully typed, with zero per-method wrapper code — see `packages/types/http.ts`.
- **`override.operationName`** strips the NestJS `Controller_method` prefix to
  clean method names, same idea as the hey-api nesting fix above, but as a
  single documented config option rather than a custom nesting function. One
  collision: `delete` is a reserved word, and Orval's fallback name (`_delete`)
  works but reads worse than every sibling method — mapped to `remove` in the
  same function. `mode: "tags-split"` already produces one file (and,
  effectively, one importable namespace) per tag, so there's no separate
  "grouping" step to configure at all — the file _is_ the group.
- **Two real bugs found in the process, on the actual committed `openapi.json`,
  not the tool:**
  1. `CustomerAuthController_changePassword` and `_logout`
     (`/stores/{slug}/account/change-password`, `.../logout`) are missing their
     `slug` path parameter in the emitted spec — Orval's spec validator
     hard-fails the _entire_ generation over this (hey-api never validates and
     silently ignored it). This is a real `apps/api` Swagger-annotation gap,
     unrelated to collections, not fixed here (see non-goals) — routed around
     via `input.unsafeDisableValidation: true` plus excluding the whole
     `CustomerAuth` tag (Orval's `filters` only supports tag/schema granularity,
     not per-operation exclusion, so the other 4 `CustomerAuth` endpoints are
     collateral until either the spec bug is fixed or that module gets migrated
     in Phase 4). Validation runs on the _whole_ spec before tag filtering —
     confirmed by testing `filters.tags: ["Collections"]` alone without
     `unsafeDisableValidation`; it still failed on the unrelated `CustomerAuth`
     paths.
  2. Generating **more than one tag at once** surfaced a second, subtler bug:
     every controller without real response DTOs yet (i.e. everything except
     `collections`) gets an anonymous `{ [key: string]: unknown }` placeholder
     response schema from `@nestjs/swagger`, and Orval names that placeholder
     after the (already-shortened) method name — `orderControllerFindAll`,
     `productsControllerFindAll`, and a dozen others all becoming
     `FindAll200Item` in the one shared `api.schemas.ts` Orval emits for
     `tags-split` mode, a genuine `TS2300: Duplicate identifier` across
     unrelated controllers. Fixed by scoping `input.filters` to
     `mode: "include", tags: ["Collections"]` — the only tag with real response
     DTOs today — rather than generating everything up front the way
     `openapi-typescript`'s old `schema.d.ts` did. This is the right scope
     anyway (untyped Prisma passthrough isn't "real types"), but the collision
     is the concrete reason to add a tag to `filters.tags` only once its
     controller has real response DTOs, not preemptively — documented in
     `orval.config.ts` and `apps/web/AGENTS.md` for whoever migrates the next
     module in Phase 4. Neither bug is Orval's fault; both were pre-existing
     gaps in what `collections`'s neighbors emit that a stricter validator
     (bug 1) and a larger generation scope (bug 2) simply surfaced.
- **No `typescript` version pin needed**, unlike hey-api/ `openapi-typescript`:
  Orval's codegen doesn't touch the TS Compiler API at all (confirmed by running
  it with no `typescript` devDependency pinned — it pulled in `typescript@6.0.3`
  transitively via `typedoc`, and generation worked identically).
  `packages/types` keeps its own `typescript@^5.9.3` devDependency regardless,
  since the package's own `tsc`/`tsc --noEmit` build/typecheck scripts still
  need it.
- **No built-in `.js`-extension option for relative imports** — needed for this
  package's NodeNext module resolution (root `CLAUDE.md`'s hard rule). Checked
  `@orval/core`'s type defs for a `fileExtension`-style option; none exists.
  Fixed with a ~30-line postprocess script (`scripts/fix-esm-extensions.mjs`,
  run as part of the `generate` npm script) that regex-appends `.js` to
  extensionless relative import/export specifiers across the generated directory
  — same "wrap the tool with a small script" shape as `apps/api`'s
  swagger-metadata/openapi-spec generators already use.
- **`@orval/query` (TanStack Query hook generation) was spiked, not adopted** —
  see the decision below.

### The `apiClient.collections.findAll(storeId)` result

`packages/types/http.ts` holds the mutator (`customFetch`) and a
`configureApiClient({ baseUrl })` setter — a runtime "configure once, call many"
replacement for the old `createApiClient(baseUrl)` factory, needed because Orval
emits plain top-level functions per operation, not methods on an instance you
construct. `apps/web/lib/api-client.ts` calls `configureApiClient` once at
module load (same `INTERNAL_API_URL`/ `NEXT_PUBLIC_API_URL` resolution as
before) and exports `apiClient =
{ collections }` — a plain object, one key per
migrated tag, so `apiClient.collections.findAll(storeId)` is the real, typed
call site, matching the DX this doc's Context section asked for verbatim.
`features/collections/api/collections.api.ts` (and its test) were deleted
outright rather than kept as a thinner wrapper — nothing was left in that file
that wasn't either generated-away (path templates, `{data,error}` handling) or
trivially inlined at the one call site that needed it (the
empty-string→`undefined` description normalization in
`use-create-collection.ts`).

### TanStack Query hook generation — decided against

Spiked `@orval/query`'s `useQuery` generation as required by this doc's open
question 2. Two concrete problems, both repo-specific rather than generic tool
complaints:

1. The react-query client wraps every response in a `{ data, status, headers }`
   envelope (needed generically to support multiple response-status branches),
   which is a **worse** shape than the plain `Promise<T>` the plain `fetch`
   client + mutator already gives — would have meant unwrapping `.data` at every
   call site, re-introducing exactly the kind of per-call-site boilerplate this
   whole effort removed.
2. Orval's query/mutation classification isn't fully automatic — with
   `query.useQuery: true` set, it generated a `useQuery` hook for
   `CollectionsController_create` (a `POST`), which is a mutation, not a query,
   and would need per-operation override config to fix.

More fundamentally: this repo's hand-written hooks aren't boilerplate that
generation would delete, they carry real logic — `collectionsKeys`' per-store
cache-key shape, each mutation's `invalidateQueries` call, and (in
already-migrated features like `orders`) hook-level business logic like the
optimistic-update/undo-timer wrapper — none of which a generic operation-to-hook
mapping can produce. Decision: `queries/`/`mutations/` stay hand-written,
calling the generated SDK client directly, for `collections` and (by default,
absent a reason to reopen this) every future migrated module.
