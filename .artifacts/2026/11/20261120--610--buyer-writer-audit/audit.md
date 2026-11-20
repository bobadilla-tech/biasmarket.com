# Buyer identity writer audit for #610

**Status:** review required before any concurrency implementation  
**Scope:** every API and maintenance-script writer found for `BuyerAccount`, `Order.buyerAccountId`, `Address`, `CustomerStoreLink`, and `Customer`.  
**Source snapshot:** `main` at `8fe4895fd57778da93293395bdd04c6be8a5e928` (2026-11-20). Links below pin that snapshot.

This is a source audit, not a concurrency proof. It records current transaction boundaries, lock order, guards, and coverage, then proposes one lock hierarchy for review. No production code is changed by this document. The repository guidance for `.artifacts/` was followed; there is no `apps/api/AGENTS.md` at this snapshot.

## Writer inventory

### 1. Checkout: account, store link, customer projection, and new order

| Writer | Transaction boundary and order | Guard / conflict behavior | Coverage |
| --- | --- | --- | --- |
| `CustomerAccountService.findOrCreateCustomer`, called inside `CreateOrderUseCase.execute` | One checkout transaction. It first takes inventory/product locks in `lockAndValidate`, then the `buyer-phone:<normalized phone>` advisory transaction lock. It reads or creates/updates `BuyerAccount`, inserts `CustomerStoreLink`, takes the `assisted-customer:<storeId>:<phone>` lock through the helper, writes `Customer`, then the caller inserts the new `Order` with `buyerAccountId`. | New-account insert uses `ON CONFLICT (phone) DO NOTHING` then re-reads. Google phone attach uses `updateMany({id, phone:null})` and checks the count; a loser becomes a guest. Mismatched email returns a guest order with no identity writes. Link insert uses `ON CONFLICT DO NOTHING`. The final Customer projection update is keyed by its id and store; it is not conditional on a version. | Unit tests assert lock-before-read, conflict insert/re-read, conditional phone attach, and store scoping. E2E tests race two checkouts and checkout against assisted checkout. These tests do not race deletion or address writes. |
| Sources | [customer-account.service.ts:114-255](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/orders/application/customer-account.service.ts#L114), [assisted-customer.ts:12-58](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/orders/application/assisted-customer.ts#L12), [create-order.usecase.ts:75-128](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/orders/application/create-order.usecase.ts#L75), [customer-account.service.spec.ts:68-380](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/orders/application/customer-account.service.spec.ts#L68), [checkout-customer-race.e2e-spec.ts:169-259](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/test/checkout-customer-race.e2e-spec.ts#L169). | | |

### 2. Buyer authentication and profile writes

| Writer | Transaction boundary and order | Guard / conflict behavior | Coverage |
| --- | --- | --- | --- |
| `CustomerAuthService.setPasswordFromToken` | Read account, hash password, then standalone `updateMany`; not wrapped in a transaction. | Filters by account id and requires at least one identity field remain; checks affected count. The account state used for the earlier confirm-token check is a stale pre-hash read. | Service unit tests cover invalid, replayed, erased-account, and erase-during-hash cases. |
| `resolveGoogleAccount` via `loginWithGoogle` / claim | Standalone account lookup/create. Store login then calls standalone `ensureStoreLink` upsert. | Google account create catches unique violation and re-reads by `googleSub`; no transaction is retained across the recoverable unique conflict. Link is idempotent on `(buyerAccountId, storeId)`. | Unit tests cover existing Google account, concurrent first-login unique conflict, and store-link call; no deletion race E2E. |
| `CustomerAuthService.changePassword` | Standalone account read, password verification/hash, standalone account update. | Update is by id only, no version/credential predicate at write. | Unit tests cover correct and incorrect password behavior. |
| `CustomerAuthService.updateProfile` | Standalone account read/validation followed by standalone account update. | Stages `name`, `countryCode`, `pendingEmail`, and `pendingPhone` in one update by id only. Email/phone duplicate checks happen before that update. Pending-phone confirmation has a separate target-phone-lock transaction below. `pendingEmail` is a relevant deletion writer: staging must enter through the account lock; confirmation separately uses id + exact pendingEmail + live-account guards. | Unit tests cover staged email/phone and duplicate prechecks; confirmation-vs-deletion regression is covered after #602, but there is no concurrent multi-writer transaction test. |
| `CustomerAuthService.confirmAccount` | Confirmation/read first. Email verification and email-change application are standalone writes. Change-phone alone opens a transaction: lock the target phone, look up collision, guarded update, re-read account. | Email-change uses `updateMany` with id, exact pending email, and non-erased-account predicate; checks count. Change-phone uses `updateMany` with id and pendingPhone non-null, but does not check count before re-reading. The target phone advisory lock serializes with checkout and other phone changes. | Unit tests cover each token purpose and the target-phone lock path; not a real concurrent database test. |
| Sources | [customer-auth.service.ts:100-155](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/customer-auth/customer-auth.service.ts#L100), [customer-auth.service.ts:382-405](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/customer-auth/customer-auth.service.ts#L382), [customer-auth.service.ts:438-468](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/customer-auth/customer-auth.service.ts#L438), [customer-auth.service.ts:520-605](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/customer-auth/customer-auth.service.ts#L520), [customer-auth.service.ts:390-480](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/customer-auth/customer-auth.service.ts#L390), [customer-auth.service.spec.ts:99-259](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/customer-auth/customer-auth.service.spec.ts#L99), [customer-auth.service.spec.ts:419-755](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/customer-auth/customer-auth.service.spec.ts#L419). | | |

### 3. Google claim: existing order link and account-store link

| Writer | Transaction boundary and order | Guard / conflict behavior | Coverage |
| --- | --- | --- | --- |
| `CustomerAuthService.claimWithGoogle` | Resolves/creates the Google account before the transaction. Inside one transaction it locks the target `Order` row `FOR UPDATE`, reads/revalidates it, conditionally sets `buyerAccountId`/claimedAt, then upserts `CustomerStoreLink`, records the event and audit row. | Order update predicate repeats claimability, null claim/account, token fingerprint and revocation checks; requires count 1. Same-account re-claim is idempotent; other claimers lose. The account row itself is not explicitly locked in the claim transaction before the order. | Unit tests assert order lock precedes decision and guarded update. E2E tests run two different accounts concurrently and two claims by the same account; exactly one claim event is expected. |
| Sources | [customer-auth.service.ts:254-378](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/customer-auth/customer-auth.service.ts#L254), [customer-auth.service.spec.ts:739-1000](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/customer-auth/customer-auth.service.spec.ts#L739), [buyer-claim.e2e-spec.ts:228-325](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/test/buyer-claim.e2e-spec.ts#L228). | | |

### 4. Global account deletion: detach orders and delete owned rows

| Writer | Transaction boundary and order | Guard / conflict behavior | Coverage |
| --- | --- | --- | --- |
| `CustomerAuthService.deleteGlobalAccount` | One transaction: plain account existence read; bulk `Order.buyerAccountId = null`; delete all `Address` rows; delete all `CustomerStoreLink` rows; clear account credentials/profile. No explicit phone advisory lock, account row lock, or ordered per-order lock is taken before the child writes. | Order update is scoped only by `buyerAccountId`; dependent deletes are scoped by account id; final update by account id. No optimistic version/count check. The initial account read can become stale while another writer changes or recreates linked state. | Unit tests verify the sequence's expected calls and unknown-account no-op. There is no E2E deletion-vs-checkout, claim, phone attach, address-create, or store-link-upsert race in the current focused specs. |
| Source | [customer-auth.service.ts:630-680](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/customer-auth/customer-auth.service.ts#L630), [customer-auth.service.spec.ts:1519-1578](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/customer-auth/customer-auth.service.spec.ts#L1519). | | |

### 5. Address CRUD and default selection

| Writer | Transaction boundary and order | Guard / conflict behavior | Coverage |
| --- | --- | --- | --- |
| `AddressesService.create` | One transaction: count addresses; if first/default, clear current defaults; insert new address. | No account-row lock; count-then-write permits simultaneous creates to both decide they are first/default. The update/create transaction is atomic individually, not serialized per account. | Unit test checks first address becomes default; no concurrent create E2E. |
| `AddressesService.update` | Address owner read occurs before transaction. Transaction clears current defaults when requested, then updates by address id. | Pre-read checks `buyerAccountId`; update predicate is id only, so deletion or ownership-state changes can race after read. | Unit test covers foreign-owner rejection, not transaction races. |
| `AddressesService.delete` | Address owner/default read occurs before transaction. Transaction deletes by id, then promotes newest remaining address if deleted row was default. | Delete predicate is id only; default promotion is based on the pre-transaction read. Concurrent delete/create/default changes can leave stale selection decisions. | Unit test covers delete and promotion. |
| `deleteGlobalAccount` | Same account-deletion transaction in writer 4 performs `address.deleteMany`. | Account-scoped; no address lock before bulk deletion. | Only account-deletion service unit assertions. |
| Source | [addresses.service.ts:21-132](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/addresses/addresses.service.ts#L21), [addresses.service.spec.ts:58-130](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/addresses/addresses.service.spec.ts#L58). | | |

### 6. Seller contact and assisted-order Customer writes

| Writer | Transaction boundary and order | Guard / conflict behavior | Coverage |
| --- | --- | --- | --- |
| `CustomersService.upsertStoreContact` | Ownership/phone validation before a short transaction. In the transaction it calls `upsertAssistedCustomer`, then updates the contact name by composite store/phone. | Helper takes `assisted-customer:<storeId>:<phone>`, inserts with `ON CONFLICT DO NOTHING`, re-reads (bounded retry), and updates a name only where it is null. Seller's explicit name update is keyed by store/phone and overwrites when non-empty. No BuyerAccount or CustomerStoreLink write. | Unit tests cover upsert without touching BuyerAccount; no seller-contact-vs-account-deletion E2E. Checkout-vs-assisted-order race is covered by the checkout E2E. |
| `upsertAssistedCustomer` from checkout | Shares checkout transaction (writer 1); see above. | Uses the same advisory key as seller contact and avoids `FOR UPDATE` on Customer, because an Order FK insert takes a conflicting row lock. | Covered by writer 1 unit/E2E references. |
| Assisted-order identity erasure/retention | Per-order transaction in `AssistedOrderIdentityRetentionUseCase`. It reads Customer, takes the assisted-customer advisory lock, re-reads Customer, conditionally clears the order's buyer identity with a snapshot predicate, then conditionally erases Customer. | Order predicate includes the previously read `buyerAccountId`, claimed/status values and eligibility; count 0 means another writer won. Customer update includes id, store, phone and `identityErasedAt: null`. It does not explicitly lock BuyerAccount. A claimed order therefore reaches Order/Customer under the assisted lock without the proposed phone/account prefix; an unclaimed order (`buyerAccountId: null`) is a separate lock domain. This is an out-of-order writer to resolve in the implementation design. | Unit tests cover idempotent retention, concurrent winner, and shared Customer preservation. No E2E race with checkout/deletion in these focused specs. |
| Sources | [customers.service.ts:338-360](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/orders/application/customers.service.ts#L338), [assisted-customer.ts:12-58](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/orders/application/assisted-customer.ts#L12), [assisted-order-identity-retention.usecase.ts:290-408](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/orders/application/assisted-order-identity-retention.usecase.ts#L290), [assisted-order-identity-retention.usecase.spec.ts:292-410](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/orders/application/assisted-order-identity-retention.usecase.spec.ts#L292), [customers.service.spec.ts:855-887](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/src/modules/orders/application/customers.service.spec.ts#L855). | | |

### 7. One-off buyer-account backfill

| Writer | Transaction boundary and order | Guard / conflict behavior | Coverage |
| --- | --- | --- | --- |
| `apps/api/scripts/migrate-buyer-accounts.ts` | If explicitly run with `--apply`, each phone group is its own transaction: create BuyerAccount, upsert a CustomerStoreLink for each source Customer, and set each linkable Order's `buyerAccountId`. Read/selection of Customer groups occurs outside those transactions. | Unique constraints are relied upon; no advisory lock or retry policy. Script is documented dry-run by default and requires explicit operational sign-off to run against a real DB. Treat it as an offline maintenance writer, not an API transaction, and do not run it concurrently with normal traffic. | No concurrency test; script's dry-run/apply behavior is its safety guard. |
| Source | [migrate-buyer-accounts.ts:84-127](https://github.com/bobadilla-tech/biasmarket.com/blob/8fe4895fd57778da93293395bdd04c6be8a5e928/apps/api/scripts/migrate-buyer-accounts.ts#L84). | | |

## Proposed lock sequence for review

This is a proposal for the implementation review; it has not been approved or proven. Use the same order whenever a transaction changes a buyer's account identity or account-linked records:

1. **Phone advisory lock(s).** Acquire `buyer-phone:<normalized E.164 phone>` before account lookup/write. If an operation spans old and new phone values or multiple accounts, acquire all phone keys in sorted order. Phone-less Google accounts skip this key and start at the account row.
2. **BuyerAccount row.** Lock the resolved account row `FOR UPDATE` and re-read the fields that authorize the operation. New-account creation remains serialized by the phone key until its row exists. Account deletion must take this lock before changing dependent rows.
3. **Existing Order rows.** After BuyerAccount, lock every affected order row in ascending id order before changing `buyerAccountId`; revalidate the same claim/deletion/retention predicates after lock. New checkout orders have no row to lock; keep the phone and account locks held through Customer/link writes and the final Order insert. Claimed assisted-order retention must join this account-root sequence; unclaimed retention with a null account can use its assisted-customer lock domain.
4. **Address rows, then CustomerStoreLink rows.** Lock/delete/update rows in stable id or composite-key order. Address CRUD and link-upsert flows must enter through the same account lock before touching these records, so deletion cannot race a stale child write.
5. **Store-scoped Customer.** Acquire `assisted-customer:<storeId>:<phone>` advisory keys in sorted order before inserting/updating Customer; retain the existing `ON CONFLICT DO NOTHING` + re-read pattern and conditional erasure/name guards. Do not take `FOR UPDATE` on Customer while a checkout may need to insert an Order referencing it.

Standalone credential/profile writes that do not change phone or child records should still lock BuyerAccount before updating. Google claim should lock BuyerAccount before Order (and then link), instead of the current Order-then-link flow. Account deletion should take phone then account then affected orders, rather than beginning with an unlocked account read and bulk-detaching orders. For retention, inspect the order's current `buyerAccountId`: claimed orders follow phone/account/order before the assisted-customer key; unclaimed rows stay in the separate assisted-customer/order domain and must not acquire BuyerAccount. This provides the requested phone/account/order order while preserving the Customer FK constraint called out by the helper.

### Review questions before implementation

- Confirm that all account-linked transactions can acquire the BuyerAccount lock before their Order and child-row locks, including phone-less Google accounts and deletion.
- Confirm the account deletion rule for Google-only accounts (no phone advisory key) and whether a stable account advisory key is needed in addition to the row lock.
- Confirm whether Address default selection should be serialized by the BuyerAccount lock or by a dedicated per-account advisory key.
- Confirm the maintenance migration is guaranteed not to overlap API traffic; otherwise add it to the lock protocol or remove it from the supported writer set.
- Confirm claimed-order retention joins the phone/account/order hierarchy and unclaimed retention stays isolated, while preserving the existing no-`FOR UPDATE` Customer rule and shared assisted-customer advisory key.
- Add real-database E2E races for deletion vs checkout, Google claim, phone attach, address create, and store-link upsert; focused mocked transaction tests alone do not prove the order or absence of deadlocks.

## Reviewer follow-up: lock bootstrap and race-test gate

The lock sequence above needs an entry procedure for operations that receive only an account id, plus coordinated entry for Google and phone-change flows. This follow-up keeps the earlier no-`FOR UPDATE` Customer constraint and does not claim that the proposed protocol is proven.

### ID-only lock bootstrap and retry

Use this procedure for account deletion, address operations, session-scoped account writes, and any other entry point that starts with only `buyerAccountId`:

1. Outside the transaction, read the account's current phone as a **hint only**. Do not authorize a write from this snapshot.
2. Start a fresh transaction. If the hint has a phone, acquire its normalized `buyer-phone:` advisory lock first. For phone changes, acquire both the snapshotted current phone and normalized target phone in sorted order.
3. Select the account row `FOR UPDATE`, then re-read phone, identity fields, and pending fields in the same transaction.
4. If the locked row's phone differs from the hint, roll back the whole transaction and retry from step 1. This includes the null-to-phone case: do not acquire a newly discovered phone lock after taking the account row lock. A phone-less row that remains phone-less can proceed from the row lock.
5. After the snapshot matches, take affected Order row locks in ascending id order, then affected Address and CustomerStoreLink row locks in stable order, then any sorted `assisted-customer:` locks and Customer writes. Recheck authorization predicates after locks.
6. Bound retries (for example, three fresh transaction attempts). On repeated phone churn, return a retryable conflict; never continue with a partial, unsorted lock set.

Phone updates must use the same entry order. The pending-phone confirmation path snapshots current and pending phone values, locks those keys sorted, locks/re-reads BuyerAccount, verifies the pending value still matches, checks target-phone ownership, then performs a guarded write and checks the affected count. Concurrent staging of `pendingPhone` must also lock BuyerAccount and condition its update on the account still being live. The `pendingEmail` staging update in `updateProfile` likewise enters through the account lock and must not stage onto an erased account.

### Google and store-link lock entry

Google account resolution may stay outside a transaction to recover from unique-key conflicts. Once an account id is resolved, every transactional write must re-enter the identity protocol:

- Snapshot the account phone, then take the phone advisory lock if present, lock BuyerAccount `FOR UPDATE`, and re-read that the account is still live and still corresponds to the resolved Google subject.
- For Google login with a store, upsert CustomerStoreLink only after that check and lock. If deletion won and cleared the Google identity, do not link from the stale pre-delete resolution; retry resolution outside the aborted transaction only if the product policy allows it.
- Google claim follows phone (if present) → BuyerAccount → Order row → CustomerStoreLink. The current Order-first lock needs to move behind the account lock. Keep the claimability and token predicates on the conditional Order update and require exactly one row to win.
- Phone-password login and all session link upserts use the same account-root check before CustomerStoreLink upsert. Phone-less Google accounts skip the phone lock and start at the account row lock.

### Required transaction assertions

Before implementation is accepted, transaction-focused tests should assert the actual lock and guard sequence, not only mock the final Prisma payload:

| Path | Required assertion |
| --- | --- |
| ID-only deletion/address entry | Phone advisory lock (when snapshot phone exists) precedes BuyerAccount `FOR UPDATE`; locked phone is re-read; any changed/null-to-phone snapshot causes rollback and a fresh retry; then affected Orders are locked in sorted id order. |
| Checkout / phone attach | The identity trace is phone → BuyerAccount → link/customer writes → new Order insert (with checkout's inventory locks recorded as a separate prefix); phone attach predicate includes `id` + `phone: null` and requires count 1. |
| Google claim | Account lock precedes Order lock; re-read confirms a live Google-bound account; conditional Order update repeats claimability/token/null predicates and requires count 1; CustomerStoreLink follows the winning update. |
| Phone/email change | Sorted old/target phone locks precede BuyerAccount lock; pending value is re-read under lock; writes are conditional on live account and matching pending value, with affected count checked. |
| Address create/update/delete | BuyerAccount lock precedes address writes; ownership is part of the write predicate; concurrent default changes serialize, with at most one default address after commit. |
| Store-link upsert | BuyerAccount lock and live-account recheck precede the composite-key upsert; after deletion commits, no link may remain for the cleared identity. |
| Customer helper/retention | Sorted assisted-customer advisory lock precedes Customer mutation; never use `FOR UPDATE` on Customer; claimed retention also follows phone/account/order before the assisted-customer lock. |

The transaction tests should assert lock SQL ordering and retry on snapshot mismatch, affected-row counts for every conditional update, stable order-id ordering, and absence of writes after a failed guard. No test should depend on sleeps.

### Deterministic E2E race matrix

Use a test-only deferred barrier at the shared lock-entry seam: pause the winner after it owns the stated lock, start the competing API operation, wait for a barrier signal that it reached that lock request, then release the winner. Exercise both winner orders where the expected result differs. Do not use timing sleeps.

| Race | Barrier placement | Expected database invariants after both requests settle |
| --- | --- | --- |
| Deletion vs checkout | Pause checkout after phone + BuyerAccount lock and before link/Customer/Order writes; start deletion and wait at the same phone lock. Then release checkout. Also run deletion-first, with checkout waiting at the phone key. | Checkout-first then delete: the order remains as a merchant record with `buyerAccountId = null`; deleted account has cleared credentials/phone, and no Address or CustomerStoreLink remains. Delete-first: checkout must not attach to the erased account; either it fails as erased or creates a distinct account per approved product policy. No order references the erased account and no duplicate phone accounts exist. |
| Deletion vs Google claim | Pause claim after account lock and before locking the order; start deletion and wait on account/phone lock. Repeat with deletion holding the account lock first. | No order references an erased account after commit; no CustomerStoreLink remains for it; a claim has at most one winning CLAIMED event. A stale resolved Google account must not create a link or claim after deletion; any retry must resolve the current identity policy. |
| Deletion vs phone attach | Pause phone confirmation after sorted old/target phone locks and account lock; start deletion. Repeat with deletion bootstrapping a null-phone snapshot while attach wins before it obtains the row lock. | Deletion-first cannot be undone by stale pendingPhone data. Attach-first forces deletion's null-to-phone snapshot mismatch to roll back/retry with the phone lock. Final erased account has no phone/pendingPhone; target phone is unique; no attach writes after an erased-account guard fails. |
| Deletion vs address create | Pause address create after BuyerAccount lock and before count/default/create; start deletion at its account lock. Repeat deletion-first. | Create-first then delete leaves zero addresses for the erased account. Delete-first makes create reject the erased account. In every committed state there is at most one default address per account. |
| Deletion vs pendingEmail staging/confirmation | Pause `updateProfile` or `confirmAccount` after account-lock acquisition and before writing the pending value; start deletion at the same account lock. Repeat deletion-first. | Update-first then delete leaves no `pendingEmail` or live email on the erased account. Delete-first makes staging/confirmation fail its live-account guard; a stale confirmation token cannot restore either the pending or current email. |
| Deletion vs CustomerStoreLink upsert | Pause login/Google store-link flow after BuyerAccount lock and before composite-key upsert; start deletion at that lock. Repeat deletion-first. | Upsert-first then delete leaves no link; delete-first rejects/no-ops the stale upsert. No link remains for a cleared account, and duplicate composite links never appear. |

For each case, assert both operation outcomes and the final database rows, not only HTTP statuses. The tests should use isolated accounts/phones/stores, clean up links before stores, and keep E2E rounds small. These are proposed acceptance checks; none were run or implemented in this documentation change.

## Coverage summary

Existing focused tests establish important local predicates and the checkout/claim races, but not the complete cross-writer protocol:

- **Covered with real concurrent requests:** two checkouts for the same new buyer; checkout vs assisted-order creation; two different Google accounts claiming one order; two retries by the same Google account.
- **Covered only with unit/service tests:** account creation conflict/phone attach guards; account deletion call sequence; address default behavior and owner checks; customer retention guards.
- **Missing as real concurrent cases:** account deletion against checkout, claim, phone attach, address create, or CustomerStoreLink upsert; simultaneous address creates/default changes; seller contact vs account deletion.
- No tests were run for this audit. This PR changes documentation only.
