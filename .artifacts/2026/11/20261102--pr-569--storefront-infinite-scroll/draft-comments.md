# Draft comments: PR #569

Posting plan: one review on #569, event `COMMENT`. Head SHA `51c2a6e251471b87c08c6d84b8666ffcc1cf182e`.

## #569: fix(storefront): load catalog pages on scroll

**Review body (COMMENT):**

> The flow reads well: the in-flight ref guard, retained pages driving the next page number, preserved filters, and the labelled status region all hold up. Two things I would fix before merge (inline); the test nits are optional. Against #488's acceptance criteria this is a partial pass: auto-load, no duplicates, sort/category preservation and stop-at-last-page are met; browsing the whole catalog from a deep link (`?page=N`) and error/retry handling are only partly covered, and cross-visit consistency and desktop/mobile behavior are unverified. Not run locally; I am relying on green CI for tests.

### 569-1 · should fix · `apps/web/components/storefront/section-renderer.tsx:676`

> `typeof IntersectionObserver === "undefined"` is evaluated during render. `store/[slug]/page.tsx` is a server component, so this renderer is server-rendered, where `IntersectionObserver` is always undefined (checked with `node -e`). SSR therefore emits the "Next" button, while the first client render emits the sentinel `div`: a hydration mismatch for every server-sorted catalog with another page. Suggest tracking support in state set from an effect (`useState(true)` for the sentinel, flip to the button in `useEffect` when IO is missing) so server and first client render match. I did not reproduce the hydration warning in a browser.

### 569-2 · should fix · `apps/web/components/storefront/section-renderer.tsx:285`

> `isLoadingMoreRef` is only reset by the effect keyed on `catalogKey/currentPage/sections`. If the `router.push` never results in a new page (offline, aborted navigation, error), the ref stays `true`, the spinner stays, the observer ignores later intersections, and no button is shown because IO exists, so the shopper cannot retry without reloading. Consider a timeout or `useTransition` pending flag that clears the ref, or showing the manual button after a failure. This is from reading the code, not reproduced.

### 569-3 · nit · `apps/web/features/storefront/components/storefront.test.tsx:567`

> `vi.unstubAllGlobals()` runs only if the assertions pass; wrap in `try/finally` like the section-renderer test does. Also still open from CodeRabbit: tests for the non-intersecting entry, the no-IO fallback button, and advancing page 2 → 3.

### 569-4 · question · `apps/web/components/storefront/section-renderer.tsx:676`

> #488's reference URL ends in `&page=2`. With this change a visitor landing on `?page=N` sees pages N onward only; page 1 is reachable via "Previous" but not by scrolling up, and error/retry handling (listed under #488's technical considerations) is not covered (see the stuck-loading comment). Is that intended for this PR? If so, I would suggest `Refs #488` plus a follow-up issue instead of `Closes`.
