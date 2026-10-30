# Review notes: assisted-order hardening PRs (#467, #468, #470, #471)

Reviewer: UltiRequiem. #453 and #465 were merged before the review started (#453 squash-merged, so the other branches now conflict add/add on the audit doc).

| PR | head | CI | mergeable | verdict |
|---|---|---|---|---|
| 467 | b4d76705 | green | CONFLICTING (audit doc only) | approve, needs rebase |
| 468 | b9200ece | green | CONFLICTING (audit doc only) | request changes |
| 470 | 8cafbb8e | E2E (API) red | clean | request changes |
| 471 | 335b4aad | green | CONFLICTING (audit doc only) | request changes |

## Ran
- Unit: api 1125/1123/1128/1127 pass on 467/468/470/471, workers 15 pass (471), web scrub-sentry 6 pass (468).
- Throwaway PG17 + Redis + workers: e2e on 470 reproduced CI. `pg_advisory_xact_lock` via `$queryRaw` -> "Failed to deserialize column of type 'void'" -> 500 on every assisted create (14 failures). With `$executeRaw` locally: 48/49 pass; remaining one is the existing concurrent-checkout test hitting the new 429.
- Probe of API scrubber (468): truncation of text after `?`/`#`, mangled multi-token strings, leak past depth 10.
- e2e buyer-claim + assisted-orders pass on 467 head. orders.e2e fails locally (no MinIO) - not attributed.

## Not verified
- Production Caddy / GlitchTip (PR #468 docs say the same).
- Customer-row wipe in 471 is from reading the code, not run against a DB.
- Subagent review rounds were skipped (user asked for a single-session review); findings above are all runtime- or code-traced.

Follow-up issue: #479.
