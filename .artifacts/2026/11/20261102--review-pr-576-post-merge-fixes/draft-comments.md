# Draft posting plan

## Stack-level issue comment on #576

> Follow-up review status for #576: focused API and mobile tests pass locally.
> Findings remain on their own PRs: the existing workflow threads on #586, the
> two session lifecycle findings already recorded in CodeRabbit on #587, the
> mixed-delivery checkout gating and validation-test gap on #597, the
> checkout-key recovery gap on #600, and the concurrent account-erasure gap on
> #602. Mobile release credentials and protected deployment branches are still
> needed for a production release; they are separate from these code findings.

## #586: fix(mobile): make Maestro and release workflows runnable

**Review body (COMMENT):**

> Thanks for hardening the workflows. I confirmed all five existing CodeRabbit
> inline findings still apply to this head. I’m replying on those threads rather
> than duplicating them.

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

**Review body (COMMENT):**

> The two lifecycle findings in the existing CodeRabbit review remain
> unresolved: a stale delete 401 can redirect a newer signed-in session, and a
> refresh read can finish after provider unmount and persist the rotated
> session. Please address those existing findings before merging. I’m not adding
> duplicate inline threads.

## #591: fix(api): make checkout replay safe

**Review body (COMMENT):**

> I found no issue in the replay changes. Focused replay tests passed locally,
> and the payload-comparison and P2002-winner mutations were detected. No local
> database E2E was run.

## #592: fix(checkout): scope proof cleanup after errors

**Review body (COMMENT):**

> I found no issue in the proof-state and cleanup changes. Focused API tests
> passed locally. No local database E2E was run.

## #597: fix(mobile): complete courier checkout and surface config failures

**Review body (COMMENT):**

> The courier field and validation changes are covered by passing mobile tests,
> but the configuration-error gate blocks valid pickup checkout on stores that
> also offer courier. The validation parity test also skips an assertion if a
> blank required field unexpectedly passes. Please address both findings.

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
> field. (The HOME reference field is optional, so keep it out of required
> assertions.) Please explicitly assert each required shown field fails
> validation and that its path appears in the issues before checking the locale
> catalogs.

## #600: fix(mobile): make checkout retries recoverable

**Review body (COMMENT):**

> Focused mobile checks pass. The 409/410 recovery still treats a failed key
> removal as success, so the same invalid key can trap checkout in a retry loop.
> Please handle that storage failure before merge.

### 600-1 · should fix · `apps/mobile/src/app/checkout/[storeSlug].tsx:425`

> This retry path awaits `clearCheckoutIdempotencyKey`, but that helper swallows
> `AsyncStorage.removeItem` failures. If removal fails, this code still shows
> the retry state; the next submit reuses the same mismatch/expired key and
> repeats the failure. Please make this path detect unsuccessful key removal and
> show a recoverable error, with a test for a rejected `removeItem`.

## #601: fix(mobile): preserve account and search context

**Review body (COMMENT):**

> I found no additional issue in this navigation and cache-cleanup slice. Mobile
> tests pass. The unresolved lifecycle findings remain on base PR #587; this
> review does not clear them. Please merge/re-review the base fix before merging
> this dependent PR.

## #602: fix(api): harden buyer account deletion

**Review body (COMMENT):**

> Focused service specs and API typecheck pass. The new erased-account guard
> still has a change-email race that can restore the stale email after deletion.
> Please make the confirmation update conditional on a live account and preserve
> the newer `main` country-code deletion test when resolving the test conflict.

### 602-1 · should fix · `apps/api/src/modules/orders/application/customer-account.service.ts:405`

> This guard checks the account snapshot before the update, but deletion can
> clear the row after the read and before the `change-email` branch below. That
> branch then writes the snapshot's `pendingEmail` back as `email`, reviving a
> deleted account identity. Make the update conditional on the account still
> being live and the pending email still matching, and add a regression test for
> confirmation racing deletion.

## #603: chore(api): type DELETE /account/me and Idempotency-Key

**Review body (COMMENT):**

> I found no issue in the OpenAPI and generated-client changes. API and types
> checks pass; the OpenAPI and SDK generation plus both drift checks pass. This
> PR is stacked on #602 and should merge after that base.

## #605: test: close remaining web and mobile test gaps

**Review body (COMMENT):**

> I found no issue in the added test coverage. The focused web association and
> mobile tests pass locally.

## #608: chore(mobile): harden the production release path

**Review body (COMMENT):**

> Workflow lint, shell checks, and OTA-guard probes pass. The release workflows
> still need credentials and protected deployment branches before a real release
> can run; that setup can happen when the app is ready to ship. The outstanding
> findings on base PR #586 still need to be resolved; this review does not clear
> them.

## #609: chore(mobile): set EAS profile environments

**Review body (COMMENT):**

> I found no issue in the EAS profile changes. They use the planned
> `development` and `preview` environments and set auto-increment on
> beta/production. The separate iOS export-compliance declaration remains out of
> this PR.
