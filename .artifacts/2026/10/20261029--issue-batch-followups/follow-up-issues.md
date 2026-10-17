# Follow-up issue drafts

Drafts only. Nothing here has been filed; the review session creates them and
closes #380 (#380 is only partly done by PR #442).

## 1. Seller "release claim" endpoint + claim notification (from #380)

**Why.** A buyer who claimed a seller-assisted order with Google (Epic #255)
cannot be undone by the seller. A wrong or hijacked claim leaves the order bound
to the wrong account with no seller-side remedy.

**What.**

- Seller endpoint to release a claim (clears `claimedAt`/`buyerAccountId`,
  revokes nothing else), scoped by `storeId` + ownership, with an `OrderEvent`
  and an audit row.
- A notification to the seller when an order is claimed (and to the buyer when
  released, if they have an email).
- Web: action in the order detail + confirmation dialog.

**Notes.** Size L (feature). Needs a product decision on what the buyer sees
after a release.

## 2. Manual device checks for the Epic #255 claim flow (from #380)

Not automatable by an agent:

- iOS Safari and Android Chrome: claim-ticket cookie hand-off through Google
  OAuth and back to `/my-purchases/orders/:id?claimed=1`.
- 360 px width: buyer order page, claim banner and error banner.
- Safari private mode: cookies/storage blocked; the page must still show the
  order link and a clear message.

## 3. Change-email: bind the token to the pending email, and harden the clash check (from #377 review)

**Why.** `confirmAccount` applies whatever `pendingEmail` is current. Tokens
carry only `id.purpose.expiry` (`packages/utils/src/customer-account-token`), so
an earlier token can be redeemed after `pendingEmail` was re-pointed. The
`updateProfile` clash check is exact-match and ignores other accounts'
`pendingEmail`.

**What.**

- Include the target email (or a hash of it) in the change-email token and
  reject a mismatch in `confirmAccount`.
- Make the clash check case-insensitive and aware of other accounts'
  `pendingEmail`.

**Notes.** With #377 (PR #435) Google no longer links by email, so the Google
impact is gone; this remains an account-integrity issue on its own.

## 4. Safe merge flow for same-email buyer accounts (from #377 / #376)

**Why.** After #377 a buyer who bought with their phone and then signs in with
Google gets a new, empty account. Today the only help is the login hint and the
`google-link-skipped` log line.

**What.** A deliberate, authenticated merge: the buyer proves control of both
identities (phone password + Google in one session), then orders/links move to
one account. Must not be reachable from an unauthenticated checkout or an
unverified email.

**Notes.** Needs a design pass (re-auth, conflict handling for orders and
addresses, audit trail). Do not reintroduce email-based auto-linking.
