# Review log: catalog export / import plan

Plan: `.artifacts/2026/10/20261020--catalog-json-export-import/plan.md`. Audit:
`.artifacts/2026/10/20261020--catalog-json-export-import/audit.md`. Reviews were
run by independent subagents (fact-check against the repo; design/security;
state-machine; product/conventions). Snapshot, not a backlog.

## v1 → v2 (round 1: 7 fact errors + 35 design findings)

- Fixed facts: JSON body cap is 100 kb (multipart required), Caddy has no
  body/time limits, CORS exposes no `Content-Disposition`, throttlers exist in
  `coupons`, mailer is an API-side producer precedent, `packages/validation`
  exists, Orval `filters.tags` list, `deploy.sh` env checksum guard, CI MinIO.
- Design: lease + CAS item claim, deterministic image keys, collection
  membership inside the product tx (no end pass), cancel/expiry/watchdog,
  supersede-own-READY, limits made consistent and enforced on export, pixel cap,
  ZIP reader rules, currency/slug/name/duplicate/merge semantics, error codes +
  HTTP vocabulary, dropped payment-bucket fallback.

## v2 → v3 (round 2: 12 + 15 and 16 + 14 + 8 findings)

- Moved docs to `docs/audits` and `docs/plans` per repo convention.
- Cut: `keepStatus`, `collections: create-new`, per-item stored content,
  client-side pre-parse, custom throttler, hand-rolled image parser, foreign
  URLs from the definition of done.
- Added: lease token fencing, Store-row lock (an earlier "advisory lock
  precedent" claim was false), atomic commit/supersede, terminal-run semantics,
  safer cleanup rules, strict S3 key rules, Unicode/JSON hardening, honest ZIP
  ceiling + image matrix, slug-plan interaction, kill switch, deploy ordering.

## v3 → v4 (round 3: 16 + 14 + 8 and 8 + 11 + 12 findings)

- **Architecture change:** runner and prepare moved into the API process with
  DB-claimed leases and an interval sweep; BullMQ/worker/internal endpoints/
  Redis commit path removed (they caused jobId collisions, stall-counter double
  counting, a Redis hang on `queue.add`, drained-color failures).
- `FOR UPDATE` on `Store` → `FOR NO KEY UPDATE` (the former blocks every FK
  insert referencing the store).
- Upload guard moved before multer (ownership, flag, Origin/CSRF, counts, disk).
- Explicit state-transition table, single `terminate()` helper, item `attempts`
  poison breaker, `lastBeatAt` heartbeat, fenced failure CAS, nullable/real
  `expiresAt` and `finishedAt` rules, orphan-key derivation from `plan.json` (no
  bucket listing), removed `upload.bin`, bulk publish scoped to an import.
- Limits reconciled: `MAX_PRODUCTS = MAX_LIVE_PRODUCTS_PER_STORE = 1000`, JSON
  24 MiB, description 5 000, refs 6 000; ZIP 90 MiB stated as the real image
  ceiling. Case-insensitive sibling categories → warning+merge; ZWJ/ZWNJ
  allowed.
- Facts resolved: Cloudflare proxies api/root/cdn/status
  (`infra/terraform/cloudflare.tf`); public collection reads filter `PUBLISHED`
  (`stores.service.ts`); `findCategoriesPublic` has no product filter; slug plan
  is on a separate branch.
- Plan reshaped to the repo's plan structure (single-word Status, Why/Goals/
  Non-goals/Decisions/Rollout/Tests/Docs/Risks/Follow-ups).

## v4 → v5 (round 4: 7 + 17 + 4 and 10 + 15 + 8 findings)

- Fixed: nonexistent product/category caps (now explicit new import/export
  ceilings, no "= live cap" claim); stale slug-plan and handoff links;
  Origin/CSRF check applies to cookie auth only (bearer exempt); pre-multer
  guard now needs Content-Length, per-process temp dir, 0600 files, unlink on
  every error path.
- Concurrency: the lease fence is a row-locking UPDATE (a plain read is racy at
  READ COMMITTED); `leaseClaims` + reset-on-progress replaces the unbacked "3
  lease expiries"; orphan purge now happens before staging deletion (plan.json
  carries ext/ContentType); flag split into runner/routes vs an always-on
  cleanup-only sweep; `enableShutdownHooks()` and lease release on SIGTERM;
  prepare heartbeat timer + CAS terminate; sweep tick reentrancy and a detached
  runner; AbortSignal-enforced item deadline.
- Semantics: count-based duplicate skip (retry-safe), reference pass limited to
  refs reachable from PENDING items with P2002 retry, `NOTHING_TO_IMPORT`,
  `matchedProductId` for previews, D8 own-CDN copies restricted to the same
  user's products with a uniform `IMAGE_UNAVAILABLE`, bulk publish scoped to
  import + DRAFT + explicit no-image confirmation.
- Scope: P3 split into P3a/P3b; P6 folded into Follow-ups; per-day counter,
  `storeId` item index and JSON Schema generation cut; retention 30 days.
- Audit: replaced a silently-unapplied earlier patch with the verified facts
  (Cloudflare proxied, public-read filters, lock semantics, lifecycle/auth
  gaps).

## v5 → v6 (round 5: 4 errors, 10 gaps, 4 suggestions)

- D8 no longer claims an indexed lookup: the runner loads the owner's image-URL
  set once per run via the `storeId` index.
- Limits made consistent: `MAX_IMAGE_REFS` 40 000 (worst case 1 000 × 36),
  `MAX_ZIP_ENTRIES` 6 002, with explicit rejection codes.
- Sweep can no longer fail a live runner (`leaseUntil < now()` on the
  `leaseClaims ≥ 3` rule; claim predicate `leaseClaims < 3`).
- Shutdown aborts and infra stops are not failed attempts (`attempts` is checked
  pre-increment and decremented on infra stops).
- Flag semantics: only upload/commit/runner gated; report/cancel/publish stay
  available; boot fails on flag-on without bucket/tmp dir; cleanup sweep
  finalises cancel-requested imports.
- Bulk publish allowed statuses, ownKey ext from the sniff, orphan-purge edge
  cases, runner drains the next queued import, `CURRENCY_CHOICE_REQUIRED`,
  single code catalog for the i18n parity test, Cloudflare `Content-Length`
  check in P0. Audit §4.6 reworded (no keep-status).
