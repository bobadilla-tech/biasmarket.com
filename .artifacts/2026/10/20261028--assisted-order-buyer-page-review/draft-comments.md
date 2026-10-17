# Draft comments

Posting plan: all reviews are `COMMENT` (reviewer is also the author; no
blockers found anyway). Stack-level comment goes on #361 (top). #357-1 is posted
as a reply to the existing CodeRabbit thread (id 4402538619), not a new inline.

## Stack

> Stack review (#357 to #361), run on each head SHA in a scratch worktree with a
> throwaway Postgres/Redis. No blockers. Held up: typecheck/lint/unit green at
> the stack top (API 759, web 574), `check-openapi-drift.sh` exits 0; #358
> headers verified on a real `next build`/`next start` for the prefixed, RSC and
> unprefixed-redirect paths (`no-store`, `no-referrer`, `noindex, nofollow` all
> present, next-intl does not override them); #359's e2e fails 4/4 on the base
> source and passes on the head, and a 40-way parallel checkout returns 40x 201
> on the head vs 8-9 500s on the base; #360/#361 are store-scoped and
> ownership-checked (mutation-tested). Should-fix items are two in #358 (pickup
> date timezone, test gaps) and one in #357 (invisible alias characters).
> Deferred items (Caddy logs, Sentry scrub, API hardening, CI header proof,
> checkout identity) will be tracked as follow-up tickets.

## #357: feat(api): alias, order number and date on the public order DTO

**Review body (COMMENT):**

> Alias/orderNumber/createdAt are allow-listed and covered by unit and e2e
> tests; the "malformed token shows the same 404" test is a nice addition. One
> real gap in the sanitizer (reply on the CodeRabbit thread). Nit: in
> `public-order.service.ts` the re-flowed comment leaves one very long line
> ("...requires the read itself to set it. The update is keyed by..."), and the
> new claim that previews do not count as a first open is only true once #358
> lands; fine for the stack, just worth knowing if #357 merges alone. Nothing
> prevents the API (`order.id.slice(-4)`) and web `getOrderNumber` from drifting
> (#339); a one-line shared-fixture test would pin them.

### 357-1 · nit · thread reply on `apps/api/src/modules/orders/application/public-order-alias.ts:7`

> Confirming CodeRabbit's point by running the function (node
> `--experimental-strip-types` on the head file): `toPublicCustomerAlias("⁠")`
> returns `"⁠"` instead of `null`, so the buyer would see "Hola, " followed by
> nothing. Cosmetic and seller-typed, but U+3164 is a known "blank name" trick,
> so it is not far-fetched. The PR body says bidi/zero-width characters are
> removed, which U+2060 contradicts. The same happens for U+00AD, U+3164 (Hangul
> filler) and tag characters (U+E0041). Also unstripped: U+180E, U+2061-2064,
> U+034F, U+FFFC, U+FFF9-FFFB, U+2800, U+115F/1160, variation selectors. Suggest
> stripping `⁠-⁤­᠎͏ㅤᅟᅠ￼￹-￻` and the tag range `\u{E0000}-\u{E007F}`, and returning
> `null` when no letter/number/symbol/punctuation/emoji remains (keep ZWJ/ZWNJ
> only between visible characters). `create-assisted-order.dto.ts` (`@Matches`,
> line 57 on main) has the same gap, so a seller can still save such a name, so
> the follow-up should cover both.

## #358: feat(web): buyer page for assisted orders (pedido/:token)

**Review body (COMMENT):**

> Verified on a real `next build` + `next start`: for
> `/es/store/x/pedido/<token>`, the `?_rsc` and `RSC: 1` variants, and the
> unprefixed path with `--max-redirs 0` (307), the response carries
> `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and
> `X-Robots-Tag: noindex, nofollow`; the HTML has the noindex/no-referrer metas,
> no third-party script, and robots.txt disallows both patterns. Typecheck is
> clean, every literal i18n key exists in es and en, totals come from the API,
> the how-to-pay rule matches the plan, and 17 of the 27 mutations I tried on
> the tests were caught. Items: pickup date shows the wrong day in Peru, the
> surviving mutations (inline), and two questions below. Small a11y/UX nits, not
> blocking: `loading.tsx` puts `role="status"` on `<main>` (no main landmark
> while loading, and the skeleton announces nothing; `public-order-page.tsx`
> does it right with a labelled `LoadingState`); `error.tsx` has no heading or
> focus move while the in-page error states do; `formatOrderDate` prints no
> year, so a link reopened months later is ambiguous.
>
> Questions: (1) the plan (section 4.2 and acceptance item 3) lists
> `X-Frame-Options: DENY` and `frame-ancestors 'none'`; none is set and the PR
> body does not mention it. The direction's keep-list names three headers and
> does not mention frame denial. Intended? (2) The PR body says "562 pass, 8
> fail in image-gallery on a clean tree". With `NODE_ENV` unset the whole web
> suite passes here; the 8 failures reproduce with `NODE_ENV=development`
> leaking from the shell, so I'd drop that note.

### 358-1 · should fix · `apps/web/features/public-order/components/public-order-view.tsx:222`

> The API stores `pickupDate` as UTC midnight (`Date.UTC(...)` in
> `order-creation.core.ts`) and returns it as an ISO string, but this formats it
> in the browser's timezone.
> `TZ=America/Lima node -e 'new Intl.DateTimeFormat("es",{dateStyle:"medium"}).format(new Date("2026-09-05T00:00:00.000Z"))'`
> prints "4 sept 2026"; with `timeZone: "UTC"` it prints "5 sept 2026". Every
> buyer west of UTC sees the previous day. Fix: add `timeZone: "UTC"` and a test
> under a non-UTC `TZ`.

### 358-2 · should fix · `apps/web/features/public-order/lib/order-state.ts:44`

> I mutated the code and re-ran the tests for this PR (27 mutations; 8 of the
> component-test ones survive, the 2 others are the guard bypasses in the
> page.tsx comment below). These still pass: removing `order.pendingAmount > 0`
> for PARTIALLY_PAID (a paid-adelanto order would read "pay again"), removing
> the `status !== "ACTIVE"` check here, making `isCancelled` ignore
> `paymentStatus` (the expired-order path; the only cancelled test sets both
> fields), moving the READY/COMPLETED check above the cancelled check,
> `gcTime: 0` -> `300000` in `use-public-order.ts`, a case-sensitive slug
> compare, adding `window.location.href` to the "ya pague" wa.me text (only the
> not-your-number href is asserted), and removing the focus effect. Please add
> one test each; the PARTIALLY_PAID-with-nothing-pending and expired-order
> (`paymentStatus` CANCELLED only) cases matter most, since they decide whether
> a paid buyer is told to pay again.

### 358-3 · nit · `apps/web/app/[locale]/(storefront)/store/[slug]/pedido/[token]/page.test.ts:15`

> This guard is a regex over `page.tsx`, so `globalThis["fe"+"tch"]()`,
> `const f = fetch; f()` or a fetch hidden behind the allowed
> `@/features/public-order` barrel pass it. It catches accidental edits, which
> is the point; I would say so in the comment (the import allow-list in the same
> file already blocks a direct `apiClient`).

## #359: fix(api): make checkout customer creation race-safe (#333)

**Review body (COMMENT):**

> Verified by running, not just reading. The new e2e fails 4/4 on the base
> source (3 runs, `UniqueConstraintViolation`/500) and passes 5/5 on the head. A
> 40-way parallel checkout through the real controller (same email, same phone
> with 5 emails incl. uppercase, and with assisted orders mixed in): all 201 on
> the head with 1 BuyerAccount, 1 link, 1 Customer; on the base 8-9 of 40
> returned 500. Mutating the `ON CONFLICT` inserts, the Google-attach guards and
> the `storeId` on the final update each fail a test. I found no lock cycle
> (advisory `buyer-phone:` lock vs the existing `FOR UPDATE` sites and
> `invite-shown`), no try/catch around a transaction statement, and every raw
> INSERT carries explicit ids and `storeId`; the `ON CONFLICT` targets match
> real unique indexes. The spec rewrite lost no test titles.
>
> Nits: (1) removing only `lockBuyerPhone` leaves the new e2e green (3 runs):
> `ON CONFLICT` already makes checkout-vs-checkout safe, so only the unit tests
> guard the lock, whose real value is Google attach/change-phone vs checkout
> (races e/f/g, which the PR says are best effort). Fine to leave; an e2e for
> change-phone racing a checkout would pin it. (2) `GUEST_RESULT` is a
> module-level object returned by reference; `Object.freeze` or a fresh literal
> avoids a future shared-mutation bug. (3) Pre-existing and disclosed in the PR
> body: the email comparison against an existing account is case-sensitive, so a
> different case yields a guest order, never a 500. It goes in the
> checkout-identity follow-up ticket. (4) The raw INSERTs use `randomUUID()`
> while Prisma generates cuids client-side, so these tables will now mix both id
> shapes; I found nothing that depends on the format, a comment would do. (5)
> `lockBuyerPhone` accepts `Prisma.TransactionClient | PrismaService`; with a
> bare client the advisory lock is released at once and serialises nothing. The
> only caller passes a real `tx`; narrowing the type to `TransactionClient`
> makes that impossible.

## #360: feat(orders): other orders of the same number in the assisted order detail

**Review body (COMMENT):**

> Store-scoped and ownership-checked, confirmed by mutation: removing
> `assertOwnership` fails the e2e (foreign order via the other seller's store:
> 404, via the owner's store: 403), removing `storeId` from the indexed query or
> count fails unit and e2e. Queries are Prisma-parameterised; on 60k orders
> `EXPLAIN` uses `Order_storeId_customerPhoneNormalized_createdAt_idx` and the
> legacy scan is bounded by `LIMIT 500`. DTO is an allow-list with no
> phone/name/payments, the generated client matches, i18n keys exist in es and
> en. One nit inline, plus: removing `storeId` from only the legacy-scan query
> fails the unit spec but not `related-orders.e2e-spec.ts`; a cross-store legacy
> fixture there would close it.

### 360-1 · nit · `apps/api/src/modules/orders/infrastructure/order.repository.ts:134`

> `normalizePhone` never throws (I ran it on "abc", "", "+", "0044123456" and "
> "), so the `try/catch` is dead. Drop the `try/catch` (same bare
> `normalizePhone` call as `customers.service.ts` already uses). Side note, only
> for pre-validation legacy rows: unparseable phones normalise to `+51`, so they
> would match each other.

## #361: fix(customers): hide ghost zero-order contacts (#337)

**Review body (COMMENT):**

> Probed through the real `GET /stores/:id/customers` with a seeded store: shown
> are a customer with orders, a guest-only phone from orders, and a customer
> whose only order is cancelled; hidden are a zero-order customer, another
> zero-order customer, and a phone whose orders exist only in another store. The
> filter runs after the guest fold; the list has no pagination/total, so no
> count drift; `GET customers/:id` and `customers/lookup` still work for a
> hidden contact. Mutations (drop the keep check, filter before the fold) fail
> the new tests. Nits: (1) a customer whose only order is cancelled stays
> visible; that matches #337's definition (zero orders), but the PR body does
> not say it. (2) Dropping the `emailVerified` clause fails the unit test but
> not the e2e.
