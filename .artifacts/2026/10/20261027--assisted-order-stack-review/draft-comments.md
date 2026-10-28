# Draft comments: assisted-order PR stack (#324-#331)

Heads reviewed (final, after the author's second push at 16:10 -05): #324
`047a55ca`, #325 `729a9c5f`, #326 `da8cb8c2`; #327-#331 re-based by one
Codacy-suppression commit `aa003e0a` just before posting: #327 `aa003e0a`, #328
`d09bf729`, #329 `72d43907`, #330 `8996cd34`, #331 `38ba2fb1`. (The first pass
was done on
`047a55ca 2326b8ee dd8ef050 2912ce5c 75064635 b6a24737 ffc8e104 0fcb0667`; items
the author already fixed in the second push were dropped from these drafts and
are listed as fixed in the review bodies.)

Posting plan: every PR gets a `COMMENT` review. The reviewing account
(`eliaz-tilt`) is the PR author, so GitHub does not allow `REQUEST_CHANGES` or
`APPROVE`. One stack-level issue comment on #324 first.

## Stack-level comment (#324)

> **Stack review summary (#324 to #331), reviewed per PR against its own base,
> then at the stack top, on the heads listed in the per-PR reviews.**
>
> What held up (all run by me): #324 is a behavior-preserving move (orders unit
> 182/182, no spec edits). `check-openapi-drift.sh` rc 0 at #325, #326, #327 and
> the top; the migration gate rc 0 and the only migration is
> `ALTER TYPE ... ADD VALUE`; generated orval changes are limited to the touched
> tags. The stack merges into `main` with no conflicts. Lock order pickup ->
> courier -> Customer -> stock -> Order holds in a parallel probe; mutation
> tests killed every #326 guard I removed; the old release still works after the
> #327 migration on a seeded DB; #328 matches the old inline checkout logic in a
> 20,000-iteration fuzz and `checkout-form.test.tsx` is untouched.
>
> Already fixed by your 15:58-16:10 push (verified at the new heads): the
> `assisted-orders.e2e-spec.ts` teardown that turned "E2E (API)" red on
> #325-#327/#329 (fresh-DB run: 2 files / 26 tests pass, no P2003), the
> `{{link}}` ICU description, the `?order=` deep link reopening the sheet, the
> stale alias after a phone change, and the dialog "Corregir número" button.
> Thanks for the quick turnaround.
>
> **Still worth correcting in the PR bodies:** #325-#331 say stacked PRs get no
> CI until retargeted ("sin CI hasta el retarget"). CI does run on them (it
> triggers on `pull_request` and the runs show base = the previous branch), so
> please link the actual runs instead.
>
> Smaller stack-level notes:
>
> - #327's Codacy failure is `TSQLLint_set-quoted-identifier` ("Expected SET
>   QUOTED_IDENTIFIER ON") on a Postgres migration: a T-SQL rule on the wrong
>   dialect, safe to ignore or exclude `packages/db/prisma/migrations/**`. The
>   Codacy "1 critical" comment on #329 is stale (the live Codacy API for the
>   earlier head reported 0 new issues after the `randomUUID` change).
> - The "#258 A2 leftovers map" from plan 5.3 has not been posted on #258 (no
>   comments there yet); post it before closing that issue.
> - Mobile stack: merging this stack vs. merging `main` into
>   `codex/phase11-release` (#237) gave the same 11-file conflict set
>   (`openapi.json`, `schema.prisma`, `packages/types/index.ts`, ...), so this
>   stack adds no new textual conflicts; regenerate `metadata.ts`/openapi after
>   resolving.
> - Release gate stays as in the #330 body: no production until #268 ships the
>   buyer page.
>
> Follow-ups suggested (not blockers): checkout-vs-assisted P2002 race (already
> #333); hide zero-order customers with no auth data in `findAllForStore` (plan
> 4.3 phantom Customer); `trust proxy` so IP-keyed public limits stop being
> global.

## #324: refactor(orders): extract shared order-creation core (#259)

**Review body (COMMENT):**

> Behavior-preserving, as intended. I compared the moved code line by line
> against `main`'s `create-order.usecase.ts`: same statements, same order
> (pickup lock, courier lock, checkout Customer upsert, stock, order insert),
> same error strings, `Number()` kept in the shipping sum, locked `pickupDate`
> passed through. No spec or e2e file changed. Ran at `047a55ca`: orders unit
> tests 182/182, `tsc` clean, `orders`, `customer-account-auth` and
> `buyer-proof-submit-race` e2e 25/25. CI is green. One nit inline.

### 324-1 · nit · `apps/api/src/modules/orders/application/order-creation.core.ts:192`

> This comment starts mid-sentence. The opening lines ("Defense-in-depth ...
> Runs inside the") were dropped in the move; compare
> `create-order.usecase.ts:173-180` on `main`. Please restore them so the lock
> explanation still reads on its own.

## #325: feat(orders): create assisted orders (#259)

**Review body (COMMENT):**

> Design matches the plan and most of it held up when I ran it: lock order
> (parallel rounds with an existing Customer all returned 201/201), 4 concurrent
> assisted creates for one new phone all 201 with one `Customer` row, no
> `BuyerAccount`/`CustomerStoreLink`, email/emailVerified/name untouched,
> 32-byte token with only the hash stored, `no-store`/`no-referrer` on the 201,
> no phone in any log line from the probes, extra DTO fields rejected,
> `finalAmount <= 0` -> 400 with stock released, user-id keyed throttle (a
> second user on the same IP is not throttled). Drift gate rc 0, unit 199/199.
>
> The e2e teardown failure I found at `2326b8ee`
> (`CustomerStoreLink_storeId_fkey`, which made E2E (API) red) is fixed by
> `729a9c5f`: on a fresh DB the two assisted specs now pass (26 tests, no P2003)
> and CI E2E is green. The remaining items are test-quality gaps and one small
> validation nit.

### 325-1 · should fix · `apps/api/test/assisted-orders.e2e-spec.ts:217`

> This assertion is flaky. `serialized` includes whole `OrderEvent` rows, so the
> `id`/`orderId`/`storeId` cuids end up in the string, and a cuid counter next
> to timestamp digits can form an 8+ digit run. I hit it in a local run:
> `"storeId":"cmvr648760000afs4dptdnilf"` contains the 9-digit run `648760000`.
> Plan 8 asks for the check on the AuditLog `metadata` and the `OrderEvent`
> `payload` only: assert on `audit.metadata` and `events.map((e) => e.payload)`.

### 325-2 · should fix · `apps/api/test/assisted-orders.e2e-spec.ts:411`

> The deadlock test can pass on a reused database even when the bug it guards
> against is present, and it leaks rows. The phones are fixed (`+5196600NNNN`)
> and the checkout's `BuyerAccount` rows are never cleaned up (5 `BuyerAccount`
> rows were left after a clean run at `821cb630`; the store-link fix did not
> cover them). On a second run `findOrCreateCustomer` takes the
> `existing.email !== email` guest path and never touches `Customer`, so there
> is nothing to contend on.
>
> In my runs, with `upsertAssistedCustomer` moved after `reserveItems` in a
> private copy, the test failed correctly on a fresh DB
> (`expected 500 to be 201`) and passed on a reused DB. Derive the phones from
> `runId` and delete the race `BuyerAccount`s in `afterAll` (by email
> `race-*-${runId}@example.com`, as `buyer-proof-submit-race.e2e-spec.ts:172`
> does).

### 325-3 · nit · `apps/api/src/modules/orders/infrastructure/assisted-orders.controller.ts:25`

> Nothing fails if `@UseGuards(SellerThrottlerGuard)` is removed (mutation: unit
> and e2e still pass). Removing `@Throttle` only fails by accident, because the
> route falls back to the module default of 5/min. The behavior is correct today
> (probe: user X 20x403 then 429 on request 21; user Y from the same IP still
> 403, not throttled). Plan 8 asks for a two-users-one-IP test on the route; an
> e2e like that, or an assertion on the guard/throttle metadata, would pin the
> wiring.

### 325-4 · should fix · `apps/api/test/assisted-orders.e2e-spec.ts:371`

> The row seeded in the other store has `customerPhoneNormalized` set, so
> dropping `storeId` from the legacy branch of `countPreviousOrders`
> (`customers.service.ts:359`,
> `where: { storeId, customerPhoneNormalized: null }`) goes unnoticed (mutation:
> unit and e2e all pass; dropping it from the indexed branch is caught). Also
> seed a legacy row (`customerPhoneNormalized: null`,
> `customerPhone: '944555666'`) in `otherStoreId` so the cross-store count is
> tested for both branches.

### 325-5 · nit · `apps/api/src/modules/orders/dto/create-assisted-order.dto.ts:78`

> `/^[^\p{Cc}]*$/u` only rejects control characters. U+202E (bidi override),
> U+200B (zero-width space) and U+2028 (line separator) pass (`node -e` with
> this regex returns `true` for those). The alias goes straight into the
> WhatsApp greeting, so consider rejecting bidi and invisible separators too.
> Rejecting all of `\p{Cf}` would also reject ZWJ/ZWNJ, which emoji sequences
> and some scripts need; this variant tested clean: `/^[^\p{Cc}​  ‪-‮⁦-⁩﻿]*$/u`
> (rejects bidi, ZWSP, LS/PS, BOM; accepts ZWJ emoji, ZWNJ and `Sofi 💜`). Low
> risk: a seller can only affect their own buyer's greeting.

## #326: feat(orders): regenerate and correct buyer link (#265)

**Review body (COMMENT):**

> This is the part of the stack I trust most after running it. On a real
> Postgres 16 with the real API: foreign, nonexistent and marketplace order ids
> return identical 404 bodies and headers; decisions come from the row re-read
> after `FOR UPDATE`; the 409 matrix holds (exactly-now expiry 409, VERIFIED
> with a past `expiresAt` allowed); a stale-token first-open stamps nothing and
> emits no LINK_OPENED (held the Order row in psql, rotated, committed); two
> users on one IP get separate buckets; correct-phone waiting on an uncommitted
> concurrent create of the same phone links the committed Customer with no
> deadlock. I removed each guard in a private copy (first-open hash filter,
> open/claim 409, `storeId` in the writes and in the re-read, expiry, CANCELLED
> status and paymentStatus, hold-status-only rule, same-phone 400, source 404)
> and the suite failed every time. `RESERVED_HOLD_STATUSES` moved with identical
> values. Drift gate rc 0. Unit 207/207, link e2e 18/18 at `dd8ef050`.
>
> Findings below are a latent buyer-side exposure, one live minor gap, and two
> test gaps.

### 326-1 · question (latent) · `apps/api/src/modules/orders/infrastructure/order.controller.ts:321`

> `toOrderDto` and `findRowByIdForStore` are shared with the buyer route
> `GET /stores/{slug}/account/orders/{orderId}` (`customer-auth.controller.ts`
> `orderDetail` returns `toOrderDto(row)`), whose OpenAPI response
> (`OrderDetailResponseDto`, `openapi.json` ~3889) now carries `createdByName`,
> `linkFirstOpenedAt` and `claimedAt`. Once the claim flow sets `buyerAccountId`
> on a VENDOR_ASSISTED order, the buyer would see the seller's display name and
> the link telemetry. This looks inconsistent with the plan's intent that
> buyer-facing responses carry no creator (the stale comment at
> `customer-auth.controller.ts:154-157`, "carries no seller-only fields", would
> also become false).
>
> Latent today: nothing writes `claimedAt` or `buyerAccountId` on assisted
> orders yet, so that route 404s for them, and `main` has no `createdBy` include
> in the repository, so the exposure is introduced here. Inferred from code and
> OpenAPI; I did not run a buyer session. Fix: a buyer projection that drops the
> three seller-only fields, or a seller-only mapper/DTO.

### 326-2 · should fix · `apps/api/src/modules/orders/infrastructure/order.controller.ts:321`

> `createdByName` is `null` for assisted orders whenever the row comes from a
> query without the `createdBy` include. Ran:
> `GET /api/stores/:id/orders/:orderId` and the list endpoint return
> `"Seller a"`, but `GET /api/stores/:id/customers/:customerId` returns the same
> order with `createdByName: null` (its `findMany` includes only
> items/product/variant). `stats.service.ts` `recentOrders` has the same include
> shape (from code, not run). Add `createdBy: { select: { name: true } }` to
> those two queries, or document that the field is only populated by the order
> endpoints.

### 326-3 · nit · `apps/api/test/assisted-order-links.e2e-spec.ts:382`

> The real-DB case from plan 8 ("stale-token first-open racing a rotation leaves
> `linkFirstOpenedAt` null and no LINK_OPENED") is missing. With the
> `accessTokenHash` filter removed from the first-open update, all 18 e2e tests
> still pass; only the unit test's exact `toHaveBeenCalledWith` catches it. The
> code is correct (I verified with the Order row held `FOR UPDATE` in psql while
> a buyer GET with the old token was in flight, then rotated and committed: 200,
> `linkFirstOpenedAt` empty, 0 LINK_OPENED), so this is only about pinning it
> with an e2e that holds an explicit transaction.

### 326-4 · nit · `apps/api/src/modules/orders/application/manage-assisted-order-link.usecase.ts:131`

> The "exactly now" boundary is untested: changing `<=` to `<` here passes the
> unit suite (207/207) and the e2e (18/18). The e2e case "hold order expiring
> right now" seeds `new Date()` before the request, so it is always already in
> the past. A unit test with `vi.useFakeTimers()` / `setSystemTime` and
> `expiresAt === now` would pin it.

## #327: feat(whatsapp): ASSISTED_ORDER_LINK template (#264)

**Review body (COMMENT):**

> Migration and compatibility checks passed when run: the only migration is
> `ALTER TYPE "WhatsAppMessageType" ADD VALUE 'ASSISTED_ORDER_LINK'`,
> `check-destructive-migrations.sh` rc 0; on a DB seeded through the #326 API,
> then migrated, the old API still serves NEW_ORDER and PAYMENT_REMINDER (200)
> and answers the new type with its 400, and keeps working after the new API
> wrote an `ASSISTED_ORDER_LINK` row; checkout only reads NEW_ORDER. The
> `PAYMENT_REMINDER` grep signal is clean, `WHATSAPP_MESSAGE_TOKENS` is a
> superset of the required tokens, the default greeting is clean for
> `""`/whitespace/null, `renderWhatsAppTemplate` uses a function replacer (alias
> with `$&` renders literally), and `wa.me` encoding round-trips
> accents/emoji/`&`/`?#`. utils 92/92 at this head, api whatsapp-templates specs
> 12/12 and e2e 9/9.
>
> Fixed since my first pass: the `{{link}}` ICU description (now quoted, with a
> new message-format test; 3804 es/en strings parse). One new should-fix on the
> mixed-version change in `6b648ca5` and one test gap. Codacy's failure here was
> a T-SQL lint rule on a Postgres migration, not a real finding; your `aa003e0a`
> suppresses it and only adds a comment line to the migration (the single
> `ALTER TYPE` statement is unchanged).

### 327-1 · should fix · `apps/web/features/store-settings/api/settings.api.ts:180`

> `.catch(() => null)` swallows every error on the `ASSISTED_ORDER_LINK` fetch,
> not just the old API's 400 for an unknown enum. A 401, 5xx or network failure
> now resolves as "no custom template", that `null` is cached as success, and
> nothing retries. The third editor then shows the default text, and a seller
> who edits it would save over their real custom template without knowing. Ran:
> the PR's own new test rejects with a plain `Error` and gets
> `assistedOrderLink: null`.
>
> Fix: only translate the expected "unknown type" 400, e.g.
> `.catch((e) => { if (e instanceof ApiError && e.status === 400) return null; throw e; })`,
> and add a 500 test. (NEW_ORDER and PAYMENT_REMINDER still fail the query, and
> a test covers that.)

### 327-2 · nit · `apps/web/features/store-settings/components/whatsapp-messages-section.tsx:238`

> The ICU test added in `apps/web/__tests__/message-format.test.ts` covers the
> string, but no web test renders `WhatsAppMessagesSection`, the third editor,
> its preview or the `TEMPLATE_KEY` cache update (grep finds none). A
> `renderWithProviders` test asserting title, description, preview and that
> saving updates `assistedOrderLink` in the cache would close the gap.

## #328: refactor(checkout): extract delivery rules

**Review body (COMMENT):**

> No findings. Ran: `git diff origin/main` of `checkout-form.test.tsx` is empty
> (and `git diff 75064635 af2b4350 -- apps/web/features/checkout` is empty after
> your merge); each extracted function matches the inline code in the base (only
> textual differences: `m.details ?? null`, equivalent because
> `isPaymentMethodConfigured` handles null and undefined, and a parenthesis-only
> Prettier change); a 20,000-iteration fuzz of old inline vs new
> `pointsRequiringDate`, `pickupDateBlocking`, `computeDeliveryCost` (compared
> with `Object.is`) and `isPartialAvailable` found no difference; web typecheck
> and lint pass; `features/checkout` tests pass.

## #329: feat(assisted-orders): new order form (#263)

**Review body (COMMENT):**

> Solid first screen: phone first with +51 default and `validatePhone`, lookup
> hint wired through `aria-describedby`, quantity clamped to stock minus
> reserved (matches the server), submit disabled while pending and for total 0,
> server error shown in an alert, 44px targets / 16px inputs / sticky submit,
> deep-path imports only (a cycle check over the real import graph finds only
> the existing `features/orders` <-> `features/stats` cycle that is also on
> `main`), every literal `t()` key I extracted from the changed web files is
> present in es and en, parity test passes, no API changes other than the new
> e2e. Web typecheck/lint clean and the assisted-orders tests pass at the stack
> top `5297536c`.
>
> Fixed since my first pass: the stale alias after a phone change (two new tests
> pass). One new should-fix on the readiness gate, one carried-over should-fix,
> and two nits. Not verified: a real phone-width browser check.

### 329-1 · should fix · `apps/web/features/assisted-orders/components/assisted-order-form.tsx:353`

> The new readiness gate (`detail.variants.length === 0 ||` inside
> `selectedProductDetailsReady`, feeding `submitBlocked`) disables submit while
> a product with variants has none chosen. That makes the `onSubmit` "variant
> required" path (`t("errors.variantRequired")`) unreachable, and the seller
> gets a disabled button with no reason. Ran (throwaway test): a product with 2
> variants, valid phone, no variant selected, click submit -> `DISABLED true`,
> and "Elige una variante." appears 0 times. The total-0 case does show a
> reason. Either leave the variant check to `onSubmit` (gate only on
> loading/error/success) or show a reason when it blocks. The loading/error
> gating itself is fine.

### 329-2 · should fix · `apps/web/features/assisted-orders/components/assisted-order-form.tsx:543`

> If `useDeliveryOptions` fails, the seller gets no signal. It does a
> `Promise.all` over the delivery, pickup, payment, `stores.findPublic` and
> couriers endpoints, so one failing endpoint fails the whole query, but the
> no-delivery and no-payment notices only render on `isSuccess`. Ran at the
> earlier head (code unchanged here): with `findStore` rejecting, the delivery
> select has 0 options and there are no alerts; submit then only says the
> delivery method is required. The same blank select also shows while the query
> is loading, with no loading indicator. Render a loading state and an error
> state (the shared `ErrorState` with retry) on `deliveryOptions.isError`, and
> block submit.

### 329-3 · nit · `apps/api/test/store-options-unpublished.e2e-spec.ts:87`

> This test is weaker than its comment claims. API-side "unpublished" is
> `isPublic=false`, which the schema comment says does not gate the storefront,
> and the four public delivery/pickup/payment/courier lookups
> (`findEnabledForSlug`) only look up by slug and do not gate on it
> (`findPublicBySlug` only passes it to `isStoreIndexable`). The test only
> asserts the status code, so a future gate that returned `200 []` would still
> pass; optionally assert the seeded default delivery and payment rows come back
> (`body.length > 0`). From code reading; I did not run this spec separately.

### 329-4 · nit · `apps/web/features/assisted-orders/mutations/use-create-assisted-order.ts:15`

> No test pins `gcTime: 0`. I removed it from all three mutations and
> `vitest run features/assisted-orders` still passed. The `accessUrl` handling
> is otherwise clean (text only, same-origin `href`, no storage), so a small
> test reading the mutation cache after unmount would protect it.

## #330: feat(assisted-orders): created screen (#263, #264)

**Review body (COMMENT):**

> The security-relevant parts check out: `accessUrl` is rendered only as
> selectable text, `href` goes through `sameOriginHref` with
> `rel="noopener noreferrer"`, no `dangerouslySetInnerHTML`/storage/URL/log use.
> The confirm text is exactly "Se enviará a +51 987 654 321. ¿Es correcto?", the
> `wa.me` URL goes through `buildWhatsAppUrl` with `encodeURIComponent`, an
> empty alias gives "¡Hola! 💜", a null template falls back to the default, copy
> has `role="status"` plus a clipboard-failure fallback, and the release-gate
> note is in the body. Mutations I tried (same-origin check,
> disabled-while-pending, total-0 guard) each made a test fail. The 8
> `image-gallery.test.tsx` failures also fail on `main`, so they are not from
> this stack.
>
> Fixed since my first pass: the `?order=` deep link no longer reopens the sheet
> (consumed once via `replaceState`; I checked the Next docs and the new tests
> pass). Three items remain, the first two reproduced with throwaway tests, the
> last read from code.

### 330-1 · should fix · `apps/web/features/assisted-orders/components/created-order-screen.tsx:69`

> `getOrderNumber` already returns `#` plus the last 4 characters, and
> `dashboard.json` (`"summary": "Pedido #{ref} · {total}"`, line 879, same in
> en) adds another `#`. Ran at the earlier head: for order `order-abcdef` the
> screen shows `Pedido ##CDEF · PEN 50.00`, while the message box on the same
> screen has `#ABCDEF` (6 chars, from `shortOrderRef`). Code is unchanged here.
> Drop the `#` from the string in es and en, and either use the same 6-char ref
> in both places or accept the mismatch knowingly (plan defers consolidation).
> Add an assertion on the summary text.

### 330-2 · should fix · `apps/web/features/assisted-orders/components/confirm-number-and-open-whatsapp.tsx:46`

> While the `ASSISTED_ORDER_LINK` template is loading, "Copiar mensaje" is
> disabled but "Abrir WhatsApp" is not, so confirming sends the default message
> even if the seller saved a custom template. Ran at the earlier head with
> `findOne` never resolving: `COPY DISABLED: true`, `WA DISABLED: false`, and
> `window.open` got `https://wa.me/51987654321?text=%C2%A1Hola%20Sofi!...` (the
> default text). At the #331 head `link-message-panel.tsx` still passes no
> `ready` to this trigger (only Copy uses `disabled={!ready}`). The same applies
> if the fetch fails: `ready = isSuccess || isError` silently falls back (with
> the default `retry: 3` that is several seconds of "Preparando el mensaje..."
> first, inferred from React Query defaults).
>
> Fix: pass `ready` into `ConfirmNumberAndOpenWhatsApp` and disable the trigger
> until it is ready; optionally `retry: 1` on `useAssistedLinkTemplate`. Add a
> test.

### 330-3 · should fix (latent until #268) · `apps/web/features/assisted-orders/components/created-order-screen.tsx:131`

> This `href` is the real buyer URL (`accessUrl`). Opening it as the seller does
> a first-open `GET /public/orders/:token`, which stamps `linkFirstOpenedAt` and
> records `LINK_OPENED` (`public-order.service.ts` first-open `updateMany`).
> From then on "Corregir número" is disabled with the "already opened" reason
> (#326), before the buyer has seen anything, and the timeline claims the buyer
> opened it. The plan has no preview exemption. It only bites once #268 ships
> the buyer page. Read from code, not run. Either drop this link, label it so
> the seller knows it locks number correction, or have the API not stamp opens
> from the seller's own session.

## #331: feat(assisted-orders): detail sheet actions (#265)

**Review body (COMMENT):**

> Matches the plan: badge, creator, buyer number, always-available send/copy
> with the new-link warning, regenerate with confirm, "Corregir número" disabled
> with an `aria-describedby` reason once opened/claimed or closed (the dialog
> button is now disabled with a reason too, fixed since my first pass), actions
> only in the sheet, no API changes, both mutations invalidate
> `ordersKeys.byStore`. The customers deep link in `601ef713` only passes an id
> and the API route does `assertOwnership` and a `storeId` check (404
> otherwise). Mutation checks (confirm dialog, disabled reason,
> `aria-describedby`) each made a test fail. At `5297536c`: api+web typecheck
> 10/10, web lint ok, 28 test files / 147 tests pass including the i18n parity
> test; all 3804 es/en strings parse as ICU. No new findings on this PR beyond
> the inherited #330 items above.
