# Review of the review: rounds log

**Status:** Three rounds done before posting anything. This file records how the
first-draft claims held up, so the posted comments can be trusted and so a later
reader can see what was changed or dropped and why.

## Round 1: first pass (notes + drafts written)

Method: read each PR's own diff, then verify the claims that depend on code
outside the diff (backend guards/services, shared packages, web routing) at the
stack top. Then run what is cheap to run. The claim ledger below is what the
first draft asserted and how each claim was checked.

| ID    | Claim                                                                                    | How checked                                                                    |
| ----- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 220-1 | `register` is single-use for confirm tokens, so register-then-signIn can strand the user | Read `CustomerAuthService.register` (409 once `passwordHash` set)              |
| 220-2 | Bearer token expires 7 days after login; client never gets the renewed token             | Read `CustomerSessionGuard`, `customer-account-token`, grep mobile for refresh |
| 223-1 | Search results are not scoped by store; category filter is name-based across stores      | Read `ProductSearchController`/`ProductSearchService`, generated params        |
| 231-1 | #231 head has an empty `pnpm-lock.yaml`                                                  | `git ls-tree` (blob `e69de29`), `git show ...                                  |
| 231-3 | A failed cart read followed by an add overwrites the stored cart                         | Read `cart-storage.ts` control flow                                            |
| 232-1 | A local cleanup failure after a successful checkout invites a duplicate order            | Read `submitCheckout`; grep for idempotency (none)                             |
| 232-2 | Prefilled fields cannot be cleared                                                       | Read the `value={form.x \|\| profile.x}` bindings and `submitCheckout`         |
| 233-1 | Order history is single-store although `GET /account/orders` exists                      | Read `getProfile` vs `getGlobalOrders`, `GlobalAccountController`              |
| 233-2 | `auth.signIn` is not a translation key                                                   | Script over all literal `t()` calls vs both catalogs                           |
| 234-1 | Push enqueue runs inside the checkout transaction                                        | Read call sites (`create-order.usecase.ts:501`, `customer-order-payments`)     |
| 234-2 | `pushToBuyer` is unguarded after the review commit                                       | Read `ReviewPaymentUseCase` (email is in try/catch, push is not)               |
| 234-3 | DTO and queue schema disagree on token prefix                                            | Ran both patterns through node/zod                                             |
| 234-4 | PUSH queue has no job options (attempts 1, no cleanup)                                   | Read both `queue.module.ts`, `default-job-options.ts`                          |
| 234-6 | OpenAPI for the device routes is invalid for Orval                                       | Ran `pnpm --filter @biasmarket/types generate`                                 |
| 235-1 | Universal-link path patterns miss locale-prefixed web URLs                               | Read `i18n/routing.ts`, `app/[locale]/(storefront)/...`, `proxy.ts`            |
| 235-2 | Android and iOS claim different path sets                                                | Read `app.json`, AASA generator, `expo config` output                          |
| 236-1 | `eas build` in Maestro workflow has no dependency install                                | Read workflow; reproduced `@expo/config` failure without `node_modules`        |
| 237-3 | No in-app account deletion                                                               | Grepped mobile and API routes                                                  |

## Round 2: attack the draft

For each comment: re-open the exact file at the PR head SHA, check the line
number, check that the line is part of that PR's diff (GitHub rejects inline
comments on lines outside the diff), and try to falsify the claim. Anchors were
checked mechanically with a script (all 37 anchors resolve to the intended line
and sit inside their PR's diff hunks).

Changes made because of Round 2:

| Draft statement                                                                     | Problem found                                                                                                                                   | Resolution                                                                                                               |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 233-1: global orders "remove the need to type a store slug at login"                | Wrong: `POST /stores/:slug/account/login` still requires a slug in the path                                                                     | Sentence removed                                                                                                         |
| 234-5: "the worker already shares the DB package"                                   | Wrong: `apps/workers` depends only on `@biasmarket/queue`; it calls internal API endpoints                                                      | Rewritten: needs an internal endpoint or move the send                                                                   |
| 234-1 labelled blocker, "Redis down fails checkout"                                 | The enqueue branch only runs for sellers with a token, and nothing registers one in this stack; Redis wait behavior is inferred, not reproduced | Downgraded to "should fix (high), latent"; blocker label kept for 234-2, which is live for any buyer with a mobile token |
| 236-1/237-1: "the action errors on conflicting versions"; "submit has the same gap" | Stated as fact; I only know the first from experience and the second by analogy                                                                 | Hedged ("can fail", "very likely")                                                                                       |
| 231 lockfile advice: restore from #223's base                                       | #223's lockfile is the double-quote-reformatted one                                                                                             | Advice changed: start from #220's, run `pnpm install`                                                                    |
| 234-8 "service extension / data-only pushes"                                        | Over-engineered suggestion                                                                                                                      | Replaced with "store locale on the token, localize server-side"                                                          |
| 235-1                                                                               | Only evidence for locale-prefixed canonical URLs was the routing config                                                                         | Added `lib/product-json-ld.test.ts` (`/es/store/demo/product/...`)                                                       |
| 223-1                                                                               | Did not mention the knock-on to #235's store deep link                                                                                          | Cross-reference added                                                                                                    |
| 234-9                                                                               | "iOS keychain survives uninstall" stated absolutely                                                                                             | Hedged ("can survive")                                                                                                   |
| Stack-level comment                                                                 | Omitted the red Vercel/Codacy checks                                                                                                            | Added as "could not diagnose"                                                                                            |

Claims that survived an explicit attempt to falsify them:

- 223-1: read `ProductSearchService.search` end to end; there is no store
  predicate anywhere, only `q`, `category` (name), `sort`.
- 234-3: both directions tested (`ExponentPushToken[` passes both;
  `ExpoPushToken[` passes only the DTO).
- 234-6: reran generation and captured the exact validator message for both the
  `post` and `delete` operations; restored the generated files afterwards in the
  scratch worktree.
- 235-1: confirmed `proxy.ts` excludes dotted paths (so `.well-known` itself is
  fine) and that the API's own emailed links are locale-less, which is why the
  locale-less form must also keep working.
- 231-1: also confirmed #231 reports `mergeable: MERGEABLE` on GitHub, i.e.
  GitHub would let it merge, which is why it is worth saying out loud.

## Round 3: gap hunt (what did the review not look at?)

Looked for areas the first two rounds skipped:

- **Web side effects of mobile changes.** Found the `packages/i18n` change that
  adds the mobile namespace to the web payload (220-3, nit) and verified that
  `cartCurrency` removal from `apps/web/lib/cart.ts` has no remaining importer
  (no comment needed).
- **Existing reviews.** Fetched all inline comments/reviews: only #220 has any
  (CodeRabbit's 3 comments about stale restore / stale 401 / delete failure, all
  already addressed in the code I read). No duplicate of those is posted.
- **CI gating.** Confirmed main's Mobile job runs only lint + typecheck, so the
  vitest files added in #220 to #233 were ungated until #236.
- **Things that looked wrong but are not** (kept in `review-notes.md`,
  "Candidates investigated and dropped"): `app.config.js` CommonJS, "required
  field" messages, server-side logout, cross-store tokens.
- **Left alone on purpose:** design/UI polish, FlashList tuning, NativeWind
  class choices, test style. None of it changes behavior and the PRs are large
  already.
- **Could not verify:** device behavior (camera recreation, push delivery,
  verified App Links), why Codacy/Vercel fail, whether real Expo tokens ever use
  the `ExpoPushToken[` prefix, whether Redis-down really stalls `add()`
  (inferred from the shared `maxRetriesPerRequest: null`). These are phrased as
  questions or "verify" in the drafts.

## Calibration notes

- Two items carry `REQUEST_CHANGES`: #231 (unmergeable head) and #234 (live
  post-commit failure path, plus the transactional coupling). Everything else is
  `COMMENT`; the maintainer can downgrade any of them.
- The findings with the highest expected value per minute of the author's time:
  231-1 (empty lockfile), 234-2/234-3 (500 on approve), 223-1 (search not
  scoped), 235-1 (deep links never match), 236-1/237-1 (workflows would fail on
  first run).
