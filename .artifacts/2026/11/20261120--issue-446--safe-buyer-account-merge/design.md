# Buyer account merge design (#446)

Status: proposal for product and security review. This document describes a future, authenticated operation; it does not authorize or implement an email-linking path.

## Current behavior and ownership

Buyer authentication is global. `BuyerAccount` has a unique phone and Google `googleSub`; `Order.buyerAccountId` owns orders in the global buyer view; `Address.buyerAccountId` owns saved addresses; and `CustomerStoreLink` records a buyer's store links. The older per-store `Customer` remains a seller-facing projection, while each order also retains its store-scoped `customerId` and checkout snapshots.

After #377, Google login resolves an existing account by `googleSub` only. Otherwise it creates a new Google account, even when another account has the same email. The skipped-link log contains account IDs only. That behavior addresses the #377 risk: control of an email attached to an attacker-created phone account is not proof of control of that account's phone credential. A merge must therefore prove both credentials independently; email equality alone must never select, link, or merge accounts.

## Proposed operation

The phone account is the **source** and the Google account is the **survivor**. The survivor ID and its `googleSub` remain stable so existing Google sign-in continues to resolve to the same identity. A merge is explicit, initiated from an authenticated buyer account flow, and requires a final confirmation after the buyer sees the affected record counts.

### Eligibility and dual reauthentication

1. Require a fresh Google OAuth authorization in this merge attempt. Its state/nonce is single-use and bound to the attempt. The returned `sub` must match the survivor's stored `googleSub`; require Google's current `email_verified=true`.
2. In the same short-lived attempt, require the source phone number and its password. Verify with the existing password hash verifier. Do not accept a pre-existing session alone as proof of either credential.
3. Require two distinct, active accounts: source has a phone and password hash; survivor has the matching Google `sub`. Neither is already merged, pending deletion, or otherwise disabled.
4. Require both accounts' current, non-null email values to be verified and to equal the fresh Google email after conservative case-insensitive normalization. Require no `pendingEmail` or `pendingPhone` on either account. Email is only an additional eligibility check after both credentials are proven; it is never an identity key or account lookup selector.
5. Reject if any unique credential would collide or if either account changed since the attempt began. Show no account-existence or conflict detail until both proofs succeed. Apply throttling and generic authentication failures to the phone proof.

A buyer with an unverified email cannot merge. A checkout-created account with a victim's email cannot be merged by the victim's Google login alone; the phone password proof is still required.

### Conflicts and record policy

- Never combine two accounts that already have different Google `sub` values, different non-null phone numbers, or conflicting non-null verified emails. Never overwrite or transfer one Google `sub` to another account.
- Move all source `Order.buyerAccountId` references to the survivor. Keep `Order.customerId`, store ownership, order/payment state, events, and checkout snapshot fields unchanged; these are merchant transaction records, not editable buyer profile data.
- Upsert source `CustomerStoreLink` rows onto the survivor using the existing unique `(buyerAccountId, storeId)` key, then remove the source links.
- Preserve all source saved addresses by reassigning them to the survivor; do not silently deduplicate or discard different address records. If both accounts have a default address, keep an existing survivor default; otherwise retain one source default and clear the other source default flags. Preserve address IDs and contents.
- Keep the survivor's non-empty profile fields; fill only missing name/country fields from the source. Move the source phone and password hash to the survivor after rechecking the phone uniqueness constraint. Revoke source device tokens and require those devices to register again; do not silently extend push access to the survivor.
- If a future relation has ownership, uniqueness, or legal-retention semantics not covered here, fail closed until its transfer policy is reviewed. Do not mutate legacy `Customer` rows or store/customer attribution as part of this operation.

Return a generic conflict response to the buyer. Record a safe internal reason code and affected IDs in the audit trail, never passwords, hashes, OAuth tokens, email, phone, address contents, or raw session/attempt tokens.

### Locking and transaction boundary

After both proofs and explicit confirmation, start one database transaction. Lock both `BuyerAccount` rows in deterministic ID order with `SELECT ... FOR UPDATE`, then re-read and revalidate eligibility, credential ownership, and all conflict checks inside the transaction. This serializes two merge attempts involving either account and avoids deadlocks from reversed source/target pairs. Ensure account-referencing writes cannot attach new data to a source after it is retired: mark it merged in the same transaction and make authentication and future writes reject merged accounts. Implementations must verify lock behavior against PostgreSQL foreign-key checks and the actual order/address write paths.

Within that transaction, transfer the records above, bump the source `passwordVersion`, clear its reusable credentials, and mark it merged into the survivor. Add a durable, global merge audit event in the same transaction (the existing store-scoped `AuditLog` is not sufficient for one cross-store operation). A small nullable `mergedIntoBuyerAccountId`/merge timestamp or equivalent tombstone is needed to prevent the source identity from being reused; do not delete the source row or cascade-delete its history. The operation is idempotent by attempt/request ID: a retry after a committed but lost response reports the recorded result and never transfers twice.

Acquire locks in one documented order (accounts by ID, then dependent rows if row-level locks are needed). Set bounded transaction/lock timeouts. Keep email sending, analytics, and other network calls outside the transaction; publish any post-commit notification through an outbox if one is needed.

### Audit, failure, and rollback

Write one append-only event such as `buyer-account.merge.completed` containing source and survivor IDs, actor type, request/correlation ID, timestamp, result, and counts by moved relation. Record rejected attempts with safe reason codes and IDs under rate limits; do not log credential material or PII. Audit persistence is part of the transaction: if it fails, the merge rolls back.

Any failed proof, stale eligibility, uniqueness conflict, lock timeout, transfer error, or audit write error leaves both accounts and all dependent rows unchanged. Return no success cookie/session before commit. After commit, invalidate all source sessions by incrementing `passwordVersion` and rejecting the merged tombstone in the session guard. If issuing the survivor session/cookie fails after commit, the buyer can sign in again; do not attempt a partial compensating merge.

## Review gates and implementation invariants

Product/security review should confirm the eligibility policy, survivor choice, profile/address conflict rules, record-retention requirements, and audit retention/access before implementation. The later implementation should test both credential proofs, unverified/mismatched/pending email rejection, #377's attacker-created-account case, unique conflicts, two concurrent/reversed merge attempts, concurrent order/address writes, transaction rollback at every transfer step, retry after lost response, and source-session invalidation.

**Invariant:** Google login continues to resolve only by `googleSub`. No checkout path, login path, email verification path, or background job may automatically attach, merge, or transfer an account based on matching email.