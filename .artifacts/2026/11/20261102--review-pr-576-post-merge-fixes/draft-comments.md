# Draft posting plan

## Stack-level issue comment on #576

> I reviewed the follow-up PRs for #576. The API replay and buyer deletion
> changes have passing hosted E2E checks, and the mobile test suites pass
> locally. Before merge, please address the existing workflow findings on #586,
> the two session lifecycle findings already recorded in the CodeRabbit review
> on #587, the mixed-delivery checkout gating and validation-test gap on #597,
> and the unrelated lockfile churn on #608. I also created the `mobile-staging`
> and `mobile-production` environments; required mobile credentials are still
> absent, and production deployment stays limited to protected branches.

## #586: fix(mobile): make Maestro and release workflows runnable

**Review body (REQUEST_CHANGES):**

> Thanks for hardening the workflows. I confirmed all five existing CodeRabbit
> inline findings still apply to this head. I’m replying on those threads rather
> than duplicating them. The required CI and Mobile checks pass.

### Replies to existing threads

**Thread 4444260572 · `.github/workflows/mobile-maestro.yml:57`**

> Confirmed. Missing Maestro fixture credentials are not checked until after the
> EAS build. Please add an earlier presence check for the fixture secrets,
> passing only boolean presence values to that step so the raw buyer password
> remains scoped to the emulator test step.

**Thread 4444260579 · `.github/workflows/mobile-production-build.yml:17`**

> Confirmed. GitHub Actions replaces the existing pending run by default, even
> with `cancel-in-progress: false`. Please set `queue: max` so repeated build
> dispatches do not silently cancel the pending build.

**Thread 4444260604 · `.github/workflows/mobile-production-update.yml:22`**

> Confirmed. The OTA update group has the same one-pending-run default. Please
> set `queue: max` so a later dispatch does not replace an already pending
> update.

**Thread 4444260623 · `.github/workflows/mobile-store-submit.yml:27`**

> Confirmed. EAS CLI 27.2.0 waits for submission completion by default. If iOS
> consumes the job's 90-minute timeout, the Android command never starts. Please
> give each platform an independent job/timeout, or otherwise make each platform
> submission independent.

**Thread 4444260637 · `.github/workflows/mobile-store-submit.yml:31`**

> Confirmed. The store-submit group also replaces its pending run by default.
> Please set `queue: max` so a later dispatch does not cancel a pending store
> submission.

## #587: fix(mobile): restore session renewal

**Review body (REQUEST_CHANGES):**

> The two valid lifecycle findings in the existing CodeRabbit review body remain
> unresolved: a stale delete 401 can redirect a newer signed-in session, and a
> refresh read can finish after provider unmount and persist the rotated
> session. Please address those existing findings before merging. I’m not adding
> duplicate inline threads. Mobile and Types CI pass.

## #591: fix(api): make checkout replay safe

**Review body (COMMENT):**

> I found no issue in the replay changes. The focused API specs passed locally,
> hosted `E2E (API)` is green, and both the payload-comparison and P2002-winner
> mutations were detected by the focused tests. No local database E2E was run.

## #592: fix(checkout): scope proof cleanup after errors

**Review body (COMMENT):**

> I found no issue in the proof-state and cleanup changes. The focused API specs
> passed locally and hosted `E2E (API)` is green. No local database E2E was run.

## #594: fix(infra): do not log session tokens or idempotency keys in Caddy

**Review body (COMMENT):**

> I found no issue in the Caddy redaction change. Both log blocks redact the
> sensitive headers, the Caddy configuration validated locally, and required CI
> is green. A post-deploy log check remains operational verification.

## #597: fix(mobile): complete courier checkout and surface config failures

**Review body (REQUEST_CHANGES):**

> The courier field and validation changes are covered by passing mobile tests,
> but the configuration-error gate blocks valid pickup checkout on stores that
> also offer courier. The validation parity test also skips an assertion if a
> blank required field unexpectedly passes. Please address both comments; hosted
> Mobile CI is green.

### 597-1 · should fix · `apps/mobile/src/features/checkout/checkout-view-state.ts:45`

> This gate checks whether COURIER is enabled, but not whether the shopper
> selected COURIER. On a store offering both methods, a failed courier config
> query sets `configError: "courier"` even after the shopper selected PICKUP;
> `CheckoutScreen` then replaces the form with a retry-only screen. Please pass
> the selected delivery method into this helper and gate the pickup/courier
> error and loading states on the selected method. Add a mixed-store test where
> courier config fails while pickup is selected.

### 597-2 · should fix · `apps/mobile/src/features/checkout/courier-fields.test.ts:65`

> This test only checks locale keys inside `if (!result.success)`. If blanking a
> required field unexpectedly passes validation, the loop silently skips that
> field. Please assert that each blanked shown field fails validation and that
> its field path appears in the issues before checking both locale catalogs.

## #600: fix(mobile): make checkout retries recoverable

**Review body (COMMENT):**

> I found no additional issue in this retry-handling slice. Mobile typecheck,
> unit/component tests, coverage, lint, and the required Mobile CI check pass.
> The documented done-marker/cart-clear failure case remains as planned.

## #601: fix(mobile): preserve account and search context

**Review body (COMMENT):**

> I found no additional issue in this navigation and cache-cleanup slice. Mobile
> typecheck and tests pass. The unresolved lifecycle findings remain on base PR
> #587; this review does not clear them. Please merge/re-review the base fix
> before merging this dependent PR.

## #602: fix(api): harden buyer account deletion

**Review body (COMMENT):**

> I found no additional issue in the deletion safety changes. Focused service
> specs and API typecheck pass; hosted `E2E (API)` is green. The branch needs
> its test conflict with the newer `main` country-code deletion assertion
> resolved before merge.

## #603: chore(api): type DELETE /account/me and Idempotency-Key

**Review body (COMMENT):**

> I found no issue in the OpenAPI and generated-client changes. API/types
> typecheck and types tests pass; the documented OpenAPI and SDK generators plus
> both drift checks pass. This PR is stacked on #602 and should merge after that
> base.

## #605: test: close remaining web and mobile test gaps

**Review body (COMMENT):**

> I found no issue in the added test coverage. The focused web association tests
> (6 tests) and mobile tests (9 tests) pass locally; hosted Mobile CI is green.

## #608: chore(mobile): harden the production release path

**Review body (COMMENT):**

> Workflow lint, shell checks, OTA-guard probes, and required hosted package
> checks pass. The lockfile adds the pinned EAS CLI, but also removes existing
> `semver@7.8.5` and `yaml@2.9.0` snapshots and changes existing peer snapshots
> outside that new dependency. Please keep this change scoped to the planned EAS
> CLI subtree unless the other resolution changes are intentional and
> documented. Mobile credentials are not configured yet; do not dispatch these
> workflows until the environment setup is complete.

### 608-1 · should fix · `apps/mobile/package.json:51`

> This direct CLI dependency is accompanied by lockfile changes outside its
> dependency subtree: the diff removes existing `semver@7.8.5` and `yaml@2.9.0`
> snapshots and changes existing peer snapshots, including the AJV peer
> resolution used by `@hookform/resolvers`. CI is green, but the plan calls for
> preserving existing resolutions. Please regenerate the lockfile with only the
> exact `eas-cli@27.2.0` dependency change, or explain why each unrelated
> resolution change is required.

## #609: chore(mobile): set EAS profile environments

**Review body (COMMENT):**

> I found no issue in the EAS profile changes. They use `development` and
> `preview` environments as planned, set auto-increment on beta/production, and
> do not make the unresolved iOS encryption declaration. CI is green.
