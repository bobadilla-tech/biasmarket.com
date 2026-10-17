# Buyer accounts (Phase 12) — learnings and follow-up work

Standalone doc. Phase 12 (buyer login + profile) shipped on `feat/more-lots`

This doc is two things: technical gotchas discovered while building Phase 12
that the next person shouldn't have to rediscover, and concrete follow-up work
that Phase 12 deliberately left undone.

## Technical learnings

- **`@thallesp/nestjs-better-auth` registers a global `AuthGuard` by default**
  (`disableGlobalAuthGuard: false`). Every controller route in this codebase
  needs `@Public()` to opt out, even ones using a completely separate auth
  mechanism (like the new `CustomerSessionGuard`) — without it, the seller
  `AuthGuard` 401s the request before your own guard ever runs.
- **That same module mounts its handler via `httpAdapter.use()` inside its own
  `onModuleInit`** — i.e. as raw Express middleware, registered ahead of Nest's
  router, during `NestFactory.create()`. Consequences:
  - No Nest guard (global `APP_GUARD` or route-level `@UseGuards`) can ever
    intercept `/api/auth/*` routes — they never reach Nest's router.
  - You can't insert your own middleware ahead of it from `main.ts` either —
    anything you `app.use()` there runs _after_ `create()` has already returned,
    by which point better-auth's middleware is already mounted first in the
    stack.
  - If you need to affect those routes (rate limiting, logging, whatever), use
    better-auth's own native config hooks instead of fighting Nest's pipeline.
    It has a real `rateLimit` option (`window`/`max`/ `customRules`/`storage`)
    with built-in default rules for
    `/sign-in*`/`/sign-up*`/`/change-password`/`/change-email` (3 req/10s) and
    `/request-password-reset` etc. (3 req/60s) — defaults to
    `enabled: isProduction`. See `apps/api/src/auth/auth.config.ts`.
- **No `cookie-parser` package is installed.** Setting cookies is fine —
  Express's own `res.cookie()` needs no extra package. _Reading_ an incoming
  `Cookie` header does — `req.cookies` is `undefined` without the middleware.
  `CustomerSessionGuard` hand-rolls a minimal parser for this (`parseCookies` in
  `customer-session.guard.ts`) rather than adding a new dependency for one
  guard.
- **Mocking a guard used via `@UseGuards(RealClass)` in a Nest `TestingModule`
  requires `.overrideGuard(RealClass).useValue(...)`** — not a plain
  `providers: [{ provide: RealClass, useValue: ... }]` entry. The plain-provider
  approach silently fails to intercept: Nest still tries to construct the real
  class (and its real constructor dependencies) during `.compile()`, so you get
  a DI error about a dependency you never intended to satisfy, for a guard that
  would never even run in a plain unit test that calls controller methods
  directly.
- **`packages/utils` and `packages/i18n` are plain `tsc`-built packages with
  static `dist/` output**, resolved via `package.json` `exports`/ `main`.
  Editing their source (including the JSON dictionaries under
  `packages/i18n/{en,es}/*.json`) doesn't take effect for a consumer until you
  rebuild (`pnpm --filter <pkg> build`) — this matters especially when running a
  single app's `tsc --noEmit`/`vitest` directly instead of through
  `pnpm turbo run <task>`, since turbo's task graph (`^build` dependency in
  `turbo.json`) handles this for you automatically and a direct
  `cd apps/x && pnpm exec tsc` does not.
- **`packages/db`'s build (`prisma generate`) requires a real `DATABASE_URL`.**
  `pnpm turbo run build --filter=api` (or `--filter=web`, transitively) fails at
  the `@biasmarket/db#build` step in any shell without one configured.
  Pre-existing environment gap, unrelated to Phase 12 — don't spend time
  debugging it as if it were a regression.
- **`git add -p` works for surgical staging on a shared/concurrent working
  tree.** Used successfully mid-Phase-12 to stage only this session's additions
  out of `packages/i18n/{en,es}/storefront.json` while a concurrent session was
  independently editing the same files (see "Concurrent-session hazard" below) —
  `printf 'n\ny\n' | git add -p
<file>` answers the hunk prompts
  non-interactively when you know exactly which hunks are yours.
- **Concurrent-session hazard was real, not hypothetical.** Partway through
  Phase 12 (during step 5), an automated commit unrelated to this work
  (`3b68807`, message `"tweaks: session limit"`) landed on this branch and swept
  up this session's then-in-progress `customer-auth` component/schema/mutation
  files alongside a large, unrelated batch of a concurrent session's work (admin
  panel, checkout, collections, sections, contact features). Nothing was lost or
  corrupted — content matched exactly what this session had written — but it's a
  real example of why the "never `git add -A`, always pass explicit paths" rule
  in this repo's working docs exists, and why re-checking `git status`/`git log`
  before trusting any assumption about file state matters on this branch
  specifically.

## Follow-up work

Roughly ordered by what a buyer would hit first.

2. **[Medium] The "set a password" CTA on the confirm page doesn't know a
   password is already set.** A customer revisiting an old magic-link
   confirmation URL after already registering still sees the form; only
   submitting it surfaces the backend's "already registered"
   (`ConflictException`) error. Fix options: add a field to
   `CustomerAccountService.confirmAccount`'s response (e.g.
   `customer.hasPassword`) and hide the CTA client-side when true, or have the
   confirm page make a separate lightweight check. Relevant files:
   `apps/api/src/modules/orders/application/customer-account.service.ts`,
   `apps/web/features/account/components/account-confirm-view.tsx`,
   `apps/web/features/customer-auth/components/set-password-form.tsx`.
3. **[Medium] No email/phone change flow.** `PATCH .../account/me`
   (`apps/api/src/modules/customer-auth/`) only updates `name` — changing email
   or phone needs a verification step (reuse the magic-link primitive, or stage
   the change until verified) that wasn't built. Frontend correspondingly shows
   all three profile fields read-only (`CustomerProfileView`).
4. **[Medium] No "forgot password" entry point.** A buyer who set a password and
   forgot it has no direct recovery path from `/store/[slug]/account/login` —
   the only way back in is the original magic-link confirmation flow (still
   fully functional, unchanged), but nothing on the login page points to it.
   Needs a "forgot your password?" link that triggers
   `CustomerAccountService.sendVerificationEmail` (or equivalent) for the
   phone/email the buyer provides.
5. **[Low] No test actually exercises the rate limits.** Unit tests mock
   `ThrottlerGuard` away entirely (same convention as the pre-existing
   `ContactController` tests), so nothing proves the buyer-login 5 req/min or
   better-auth's native 3 req/10s actually engage under load. Would need an e2e
   test against the real `AppModule` (`apps/api/vitest.config.e2e.ts`).
6. **[Low] `infra/docker/DEPLOY_ORACLE.md`'s "no rate limiting wired in despite
   `@nestjs/throttler` being installed" note is now stale** — both the buyer and
   seller login surfaces have rate limiting as of Phase 12. Worth a docs-only
   follow-up pass across `infra/docker/DEPLOY_ORACLE.md` and wherever else that
   gap is called out (`CLAUDE.md`'s "Known gaps called out there" line
   references it too).
