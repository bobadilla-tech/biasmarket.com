# Review notes: PR #569 storefront infinite scroll

| PR  | Title                                         | Head SHA                                   | Base                         | CI                                                         | Existing reviews                                                                                            |
| --- | --------------------------------------------- | ------------------------------------------ | ---------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 569 | fix(storefront): load catalog pages on scroll | `51c2a6e251471b87c08c6d84b8666ffcc1cf182e` | main (`626232a8` merge base) | 8 passed incl. Web, Web E2E (a11y), CodeRabbit; 16 skipped | CodeRabbit only (COMMENTED); its inline thread on the missing no-IO fallback is marked addressed in 51c2a6e |

Scope: 3 files, `section-renderer.tsx`, `section-renderer.test.tsx`, `storefront.test.tsx`. Closes #488 (acceptance criteria not fetched).

## What ran

- `gh pr view/checks`, reviews, inline comments: read.
- Full diff (`git diff 626232a8...51c2a6e`, lockfile excluded): read.
- `node -e "typeof IntersectionObserver"` → `undefined` (SSR environment).
- i18n keys `nextPage`, `loadingMore` exist in en and es `storefront.json` at head.
- Store page (`app/[locale]/(storefront)/store/[slug]/page.tsx`) has no `"use client"`, and passes `catalogPagination`/`serverSorted` into the client renderer, so the renderer is server-rendered.

## Findings

### 569-1 · should fix · hydration mismatch (section-renderer.tsx:676)

`typeof IntersectionObserver === "undefined"` is evaluated during render. On the server it is always true, so SSR emits the "Next" button. On the client it is false, so the first client render emits the sentinel `div`. This is a hydration mismatch on every server-sorted catalog with another page. It is visible as a React hydration error in dev and as a flash of the button before hydration. Fix: `useState(false)` + `useEffect` to set `hasIntersectionObserver`, render the sentinel by default (or the same markup on both), and show the button only after the effect finds no IO.
Verified: node probe + page.tsx is a server component. Not verified: actual hydration warning (no runtime run; the worktree could not be created in the sandbox and no install was done).

### 569-2 · should fix · stuck loading state with no retry (section-renderer.tsx:285)

`isLoadingMoreRef.current = true` is only reset by the effect keyed on `[catalogKey, currentPage, sections, serverSorted]`. If the `router.push` never lands (offline, aborted, server error that does not change `currentPage`), the ref stays true, the spinner never clears, the observer ignores every later intersect, and the fallback button is not rendered because IO exists. The shopper must reload. Before the PR the button was disabled only while loading and also never recovered, so this is partly pre-existing, but the old button at least stayed visible. Suggest a timeout/`useTransition` pending flag, or rendering the button after a failure. Inferred from code, not reproduced.

### 569-3 · nit · tests

- `storefront.test.tsx:567`: `vi.unstubAllGlobals()` is not in a `finally`, so a failed assertion leaks the stub (the section-renderer test does it correctly).
- No test covers the no-IntersectionObserver fallback button (the branch added for the CodeRabbit comment), the non-intersecting entry, or advancing from page 2 to 3 after retaining page-2 results. The last two are CodeRabbit nitpicks, still open.

## Praise

Duplicate in-flight requests are guarded by a ref, the observer reuses `loadedCatalogPage`, so the next page follows retained pages, filters in the query string are preserved, and the old CTA is replaced by a labelled `role=status` region.

## Dropped

- "Previous" button not setting the ref: harmless, the effect resets the state on arrival.
- Observer recreated on each `loadedCatalog` change: intended, the new observer's initial callback chains loads when the sentinel is still visible, and the ref is reset first because the reset effect is declared earlier.

## Not verified

Actual tests/typecheck (CI Web passed), browser behavior, issue #488 acceptance criteria. Subagent review rounds A–E were not run (small 3-file PR); see `review-rounds.md`.

## Anchor check (mechanical, head `51c2a6e`)

Right-side hunks from `git diff -U3 626232a8...51c2a6e`:

- `section-renderer.tsx`: 204-228, 243-249, 265-311, 670-712
- `storefront.test.tsx`: 525-548, 553-570

| Comment | Line                     | In hunk       | Line text                                          |
| ------- | ------------------------ | ------------- | -------------------------------------------------- |
| 569-1   | section-renderer.tsx:676 | yes (670-712) | `(typeof IntersectionObserver === "undefined" ? (` |
| 569-2   | section-renderer.tsx:285 | yes (265-311) | `isLoadingMoreRef.current = true;`                 |
| 569-3   | storefront.test.tsx:567  | yes (553-570) | `vi.unstubAllGlobals();`                           |

No existing bot/human thread sits on these lines (CodeRabbit's thread is on the sentinel block around 673-694, so 676 is inside its range; mention in body or reply instead of a duplicate if it is still open. It is marked addressed, so I kept the comment).

## Issue #488 acceptance criteria

| Criterion                                     | Status           | Evidence                                                                                                                                                                                 |
| --------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Products load automatically on scroll         | Met              | observer with `rootMargin: 500px`, pushes `page = loadedCatalogPage + 1`                                                                                                                 |
| "Load more" button removed                    | Met, with caveat | removed when IO exists; a "Next" button remains for no-IO browsers. `loadMore` i18n key now unused                                                                                       |
| Consistent across visits                      | Unverified       | root cause of the "sometimes partial" report not investigated by the PR; also see 569-1 (SSR/client markup differs)                                                                      |
| No duplicates or skips                        | Met by code      | `mergeCatalogPages` dedupes by `productId`, pages keyed by number                                                                                                                        |
| Sort preserved                                | Met              | `searchString` is reused; test covers `orden`                                                                                                                                            |
| Category filters work                         | Met              | `categoria` preserved, test covers it                                                                                                                                                    |
| Browse to the last product                    | Partial          | stops at `loadedCatalogPage * limit >= total`. A deep link such as `?page=2` (the issue's own reference URL) starts at page 2; page 1 is reachable only via "Previous", not by scrolling |
| Desktop and mobile                            | Unverified       | no device or browser run; IO is standard                                                                                                                                                 |
| All stores                                    | Likely           | one shared renderer; the seller preview path is not `serverSorted`, so unaffected                                                                                                        |
| Tech note: handle error and completion states | Partial          | completion handled; error/retry not (569-2)                                                                                                                                              |

Verdict: `Closes #488` is defensible only if the deep-link and error-state gaps are accepted as follow-ups. Otherwise use `Refs`.
