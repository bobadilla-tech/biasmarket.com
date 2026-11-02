# Review notes: PR #576 (Consolidate mobile Epic implementation)

## Scope

| PR                                                                 | Head SHA                                   | State at review                                                          | CI                                                                            | Existing review                                                                                                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #576 (`codex/mobile-epic-consolidated` -> `main`, author crydafan) | `8a2097675b435bea0afce71a855aa6bd9610c3b0` | MERGED 2026-11-02 06:00 UTC (merge commit `d8c645fa`, parent `626232a8`) | all jobs pass; CodeRabbit check "fail" (review aborted because the PR closed) | CodeRabbit (3 reviews, 39 inline threads all resolved, ~36 findings only in review bodies), Copilot (no quota), Codacy, Codecov (patch 67.04%, 58 lines missing) |

Diff used: `git diff 626232a8...8a209767 -- . ':!pnpm-lock.yaml'` (75 files,
+3921 -242). `origin/main` differs from the head only by two added steps in
`mobile-release.yml`, so every finding holds on `main` too.

Reviewer identity: `UltiRequiem`
(`GH_TOKEN=$(gh auth token --user UltiRequiem)`; the lowercase login named in
the request does not exist in the keyring).

## What ran

- `pnpm install --frozen-lockfile --ignore-scripts` in a scratch worktree: OK.
- API specs (create-order.usecase, customer-auth.service,
  checkout-upload-limits): 3 files, 127 tests pass. Mobile vitest 26 pass, jest
  components 4 pass, web `.well-known` 6 pass, `@biasmarket/types` 12 pass.
  Mobile typecheck clean.
- Throwaway Postgres 16 (`pr576-pg`, port 55432, removed afterwards): all
  migrations applied; `prisma migrate diff` empty (no drift).
- `android-emulator-runner` pinned SHA source read; every `script:` line of
  `mobile-maestro.yml` replayed through `sh -c`.
- Checkout schema run against AGENCY form values and an empty form (missing
  catalog keys).
- 52 single-change mutations on new behavior (see 576-17/18/19 for survivors).
- `gh api` read-only: environments (`copilot`, `Preview`, `production`),
  `branches/mobile-release` (404), review threads (all resolved).
- `@tanstack/query-core` 5.105.0 `removeQueries` on an observed query.

## Findings

IDs match `draft-comments.md`. Severity: B blocker for the mobile release, S
should fix, Q question, N nit.

| ID     | Sev | Area    | Summary                                                                              |
| ------ | --- | ------- | ------------------------------------------------------------------------------------ |
| 576-1  | B   | CI      | Maestro `script:` runs per line; cannot work                                         |
| 576-2  | S   | CI      | no KVM step                                                                          |
| 576-3  | B   | CI      | pnpm/action-setup after setup-node in 3 workflows (bot review-body, never revisited) |
| 576-4  | S   | release | `eas update` without `--environment`                                                 |
| 576-5  | S   | release | environments/branch do not exist; dispatch from any ref; job-level secrets           |
| 576-6  | S   | release | unpinned `npm i -g eas-cli`, `curl                                                   |
| 576-7  | Q   | release | `expo-updates` not a dependency                                                      |
| 576-8  | S   | release | eas.json env/autoIncrement gaps; silent prod API fallback                            |
| 576-9  | N   | release | missing `usesNonExemptEncryption`                                                    |
| 576-10 | S   | mobile  | session refresh handler removed                                                      |
| 576-11 | B   | mobile  | AGENCY courier checkout impossible                                                   |
| 576-12 | S   | mobile  | raw i18n keys for 5 validation paths                                                 |
| 576-13 | S   | mobile  | no 409 handling, key fingerprint only covers items                                   |
| 576-14 | S   | api     | `Customer` PII survives account deletion                                             |
| 576-15 | S   | api     | unscoped, unindexed `orderPayment.findFirst` on error path                           |
| 576-16 | S   | api     | replay returns expired/cancelled order                                               |
| 576-17 | S   | tests   | `deleteGlobalAccount`/DELETE untested                                                |
| 576-18 | S   | tests   | replay compare + race path mostly untested                                           |
| 576-19 | S   | tests   | `CheckoutController.create` has no spec                                              |
| 576-20 | S   | web     | `removeQueries` on active profile query                                              |
| 576-21 | N   | web     | `window.confirm`, duplicate import                                                   |
| 576-22 | N   | mobile  | proof compression upscales                                                           |
| 576-23 | S   | docs    | release docs contradict workflows; `ci.md` stale                                     |

Replies (not new comments): 4439033730 (proofSubmitted `source` never used) and
4439033777 (Sign up link still passes `params.storeSlug`) were resolved by the
author but the code at head is unchanged.

## Candidates investigated and dropped

- CSRF on `DELETE /account/me`: a verified bearer is exempt, cookie requests
  need an Origin; no gap.
- Session invalidation after deletion: `passwordVersion` bumped in the tx; old
  tokens rejected.
- Replay information disclosure: replay needs identical contact/items/shipping,
  key is unique per store; a key-only guesser gets 409.
- Item-merge false 409s: stored `shippingAddress` is
  `{...input.shippingAddress}` and `reserveItems` does not merge lines, so
  comparison is consistent.
- `pnpm/action-setup` hard error on `version: 10` vs `packageManager`: the
  pinned action has no mismatch check; only drift remains (mentioned in 576-6).
- Next-intl proxy intercepting `/.well-known/*`: the matcher excludes paths with
  a dot; no redirect.
- CommonJS `app.config.js`: loads under Expo CLI; only a nit against the "ESM
  only" rule, not posted.
- Token leaks / open redirect in mobile: Authorization header only, SecureStore,
  `encodeURIComponent` on proof/checkout paths; none found.

## Not verified

- Nothing ran on a device or emulator (Maestro picker, KVM, link verification).
- `eas update` environment behavior and OTA behavior without `expo-updates` are
  stated as questions.
- Seq-scan cost of the `imageUrl` query is inferred from the missing index, not
  measured.
- Account-deletion and replay behaviors were read, not run against a database.
- `pnpm lint` did not complete locally (the default Homebrew node aborts);
  eslint run directly printed nothing.
