# Server-side scheduling of blue/green old-color cleanup

Written before execution, at the user's explicit request, to allow a review pass
before any code is written — same deliberate deviation from this directory's
normal "record after the work lands" convention already used by
[`2026-08-10-bluegreen-zero-downtime-deploy-plan.md`](2026-08-10-bluegreen-zero-downtime-deploy-plan.md).
Originally a planning-only record with no code changed; see the Status section
below for what has since landed.

## Status: implemented (task list items 1-8), not run against the real VPS

All eight task-list items landed as designed. No behavior described in the
"Design decisions" section above was changed during implementation — the
canonical `schedule_cleanup()`/`cancel_scheduled_cleanup()` code block in
decision 3 was copied essentially verbatim into
[`infra/vps/lib/cleanup_schedule.sh`](../../infra/vps/lib/cleanup_schedule.sh).
Four judgment calls made where this doc didn't fully specify the literal code,
none changing behavior on the success path:

- Both functions end with an explicit `return 0` (the canonical block relies on
  `rm -f`'s/`log_info`'s incidental exit status for this, which decision 5
  itself calls out as working "only by accident" for
  `cancel_scheduled_cleanup`). Making it explicit removes that
  accident-dependency without changing what either function returns on success.
- The call site in `cmd_deploy` uses `X || log_warn "..." || true`, not just
  `X || log_warn "..."` as decision 5's illustrative snippet shows — the
  trailing `|| true` is defense-in-depth against `log_warn`'s own `printf` ever
  failing (e.g. a closed stderr) under `set -e`, consistent with, not a reversal
  of, decision 5's "must never fail the deploy" requirement.
- `cd.yml`'s rsync step gained both `--delay-updates` **and** `--delete-delay`,
  not just `--delay-updates` as decision 9 recommends — `--delete-delay` extends
  the same single-final-pass atomicity to the deletion side of `--delete`, for
  the same narrowing-not-closing reason decision 9 gives for `--delay-updates`
  on the update side.
- `cancel_scheduled_cleanup`'s `/proc/$pid/cmdline` identity check matches only
  `"$ROOT_DIR/deploy.sh"` (a fixed-string `grep -qF`), not decision 3's literal
  `grep -qE 'sleep|deploy\.sh'`. Narrowed post-review: `schedule_cleanup` passes
  `"$ROOT_DIR/deploy.sh"` as `bash -c`'s positional `$0` argument, so that path
  string is present in `/proc/$pid/cmdline` for the chain's entire lifetime — as
  the positional arg during the `sleep`, as `argv[0]` after the `exec` into
  `--cleanup` — making the bare `sleep` alternative both redundant (the path
  already matches during that phase) and needlessly broad (it would also match
  any unrelated process that happens to invoke `sleep` for its own reasons).
  Same detection coverage, smaller false-positive surface.

**Not run against the real VPS** — per the task brief, `infra/vps/deploy.sh` is
synced to production and there is no test environment for it. Verification was
static: `shellcheck` clean on both
[`lib/cleanup_schedule.sh`](../../infra/vps/lib/cleanup_schedule.sh) (one
intentional `SC2016` info-level note — the canonical `bash -c '...'` string is
single-quoted on purpose, decision 3's whole point is that `$0` must NOT expand
until the `exec` inside the child, at fire time) and the modified `deploy.sh`
via `shellcheck -x deploy.sh` (which follows the real source chain and resolves
`cleanup_schedule.sh`'s apparent-unassigned
`$sha`/`$current_color`/`$candidate_color` references against `cmd_deploy`'s
locals — clean, 0 warnings); both new/changed GitHub Actions YAML files parse
correctly (`yaml.safe_load`, `actionlint`/`yamllint` not available in this
environment). Same bar as the blue-green plan's own T1-T10: typecheck/build/
test plus manual script review, not a live cutover (that plan's own T11 still
hasn't run either, per its Status section).

**This doc's inline `file:line` citations are not re-numbered
post-implementation.** They were accurate when this plan was authored (per the
task brief's own warning) and describe two kinds of thing: (a) pre-existing
`deploy.sh`/`cd.yml` behavior this plan didn't touch, still accurate in content
even where line numbers have since shifted; (b) the exact insertion/removal
points this plan specifies, which by definition moved once implemented. For (b),
the current locations are: `cmd_deploy`'s
`cancel_scheduled_cleanup`/`schedule_cleanup` calls sit at `deploy.sh:234-235`,
immediately after `phase "state_committed"` at `deploy.sh:227` (was
`deploy.sh:225` pre-implementation — the file grew by
`lib/cleanup_schedule.sh`'s new `source` line plus the two guarded calls and
their explanatory comment). `cd.yml`'s `scheduled-cleanup` job and
`production-cleanup` concurrency group (previously `cd.yml:203-233`,
`cd.yml:205-233`-ish depending on which citation in this doc you're reading) no
longer exist at all — deleted per task item 5 — so any citation into that range
now points past the end of the `sync-and-deploy` job instead. Read the files
directly rather than trusting a specific line number anywhere in this doc.

## Context

`.github/workflows/cd.yml`'s `scheduled-cleanup` job
([lines 203–233](../../.github/workflows/cd.yml#L203-L233) as of this writing)
holds a GitHub Actions runner open for 30 minutes via a literal `sleep 1800`
before SSHing in to run `deploy.sh --cleanup`. This burns a GHA concurrency slot
and CI minutes for a job that does nothing but wait, and if GitHub Actions has
an outage or evicts the runner mid-sleep, the scheduled cleanup is silently lost
— no retry, it just never happens until someone notices stale containers.

`cmd_deploy` in [`infra/vps/deploy.sh`](../../infra/vps/deploy.sh) already knows
exactly when a 30-minute cleanup window should start: the `state_committed`
phase ([deploy.sh:222-225](../../infra/vps/deploy.sh#L222-L225)), right after
`atomic_write "$ROLLBACK_TARGET_FILE" "$current_color"`. This plan moves the
30-minute delay server-side: after a successful cutover, `deploy.sh` backgrounds
a detached `sleep 1800 && deploy.sh --cleanup` itself, using the same
`setsid ... </dev/null >/dev/null 2>&1 &`-style detachment already used in
`ssh-deploy-dispatcher.sh`'s `launch()`
([ssh-deploy-dispatcher.sh:51-78](../../infra/vps/bin/ssh-deploy-dispatcher.sh#L51-L78)).

**`systemd-run` is explicitly out of scope for this mechanism.** It was tried
and ripped back out earlier in this project specifically because
`systemd-run --scope` over this VPS's non-interactive forced-command SSH
sessions hits polkit's "Interactive authentication required" (see the full story
in `ssh-deploy-dispatcher.sh`'s header comment,
[lines 36-45](../../infra/vps/bin/ssh-deploy-dispatcher.sh#L36-L45)). Note this
means decision 8 in the blue/green plan doc
([2026-08-10-bluegreen-zero-downtime-deploy-plan.md:354-355](2026-08-10-bluegreen-zero-downtime-deploy-plan.md#L350-L387))
is now stale where it still says `deploy.sh` runs detached via
`systemd-run --scope --unit=biasmarket-deploy` — the implemented mechanism is
`setsid`, not `systemd-run`. That plan's Status section already documents this
kind of literal-wording deviation for a different piece (decision 7/T7); this
doc's execution should also fix the decision-8 sentence itself, not just note
the drift here.

There is a second, unrelated systemd precedent in this repo worth naming
explicitly so it isn't confused with the rejected one:
`infra/vps/systemd/biasmarket-migration-watchdog.{service,timer}` is a real,
working systemd timer, installed once at provisioning time
(`docs/core/blue-green-migrations.md` Step 8), running every minute, independent
of `deploy.sh`'s own process tree. It works because it's a **statically
installed unit started by systemd itself** at boot, not a `systemd-run`-launched
transient unit **spawned from inside a forced-command SSH session** — that's the
specific combination that hits polkit. Decision 3 below explains why this plan
still doesn't reuse that pattern for cleanup scheduling, even though it would
solve the reboot-survival edge case for free.

**This Context section describes the pre-implementation state, as originally
written** — at the time this section was drafted, `cd.yml`'s `scheduled-cleanup`
job (the literal 30-minute-`sleep` runner job described above) still existed and
was the only mechanism for old-color cleanup; it has since been deleted as part
of implementing this plan. See the "Status" section above for what actually
landed: the job is gone, replaced by `deploy.sh`'s own
`schedule_cleanup()`/`cancel_scheduled_cleanup()` plus the hourly
`cleanup-fallback.yml` backstop. Same convention as
[`2026-08-10-bluegreen-zero-downtime-deploy-plan.md`](2026-08-10-bluegreen-zero-downtime-deploy-plan.md)'s
own Context section.

## Design decisions

### 1. Where cleanup gets scheduled from

`cmd_deploy` schedules cleanup itself, right after the `state_committed` phase's
own `phase "state_committed"` call
([deploy.sh:225](../../infra/vps/deploy.sh#L225)) — i.e. after both
`atomic_write "$ROLLBACK_TARGET_FILE" "$current_color"`
([deploy.sh:224](../../infra/vps/deploy.sh#L224)) and the `phase` marker itself,
not interleaved between them (see task list item 3 for why the exact placement
matters for `deploy.lock.meta`'s live observability). Not a new phase of its own
— nothing here should move `LAST_PHASE`/`on_exit`'s success/failure accounting;
scheduling failure must never turn an already- successful cutover into a
reported deploy failure (see decision 5).

`cmd_rollback` does **not** schedule or cancel anything. This is intentional,
not an oversight — see decision 6.

### 2. New state files

Two new files under `infra/vps/state/` (added to the existing `state/` exclusion
in `cd.yml`'s rsync `--delete` step
([cd.yml:164](../../.github/workflows/cd.yml#L164)), same as
`current_color`/`rollback_target`/etc. — this needs no rsync-exclude change,
`state/` is already excluded wholesale):

- `state/scheduled_cleanup.pid` — the PID of the detached
  `setsid ... sleep 1800 && deploy.sh --cleanup &` process, written via the
  existing `atomic_write` helper (`lib/state.sh`).
- `state/scheduled_cleanup.meta` — human-readable, same spirit as
  `deploy.lock.meta`'s "who/what holds this and since when" property (decision 8
  of the blue/green plan): `pid=`, `scheduled_by=<sha>`,
  `scheduled_at=<UTC timestamp>`, `fires_at=<UTC timestamp>`,
  `candidate_color_at_schedule=<blue|green>`. This is what lets an operator
  SSHed into a stuck-looking VPS answer "is a cleanup pending, for what, and
  when does it fire" without guessing — the same property the blue/green plan's
  decision 8 called load-bearing for `deploy.lock.meta`, extended to this new
  piece of scheduled state. `candidate_color_at_schedule` is explicitly a
  snapshot, not authoritative at fire time — decision 4 re-reads
  `state/rollback_target` fresh when the cleanup actually runs, and that value
  can differ (e.g. after an in-window `--rollback`, decision 6). The field
  exists purely so an operator doesn't have to reconstruct "what was true when
  this was scheduled" from `releases/history.log` by hand; the doc update in
  task item 8 must state this caveat explicitly next to the field, not just
  imply it here.
- `state/scheduled_cleanup.log` — stderr/stdout capture for the backgrounded
  process, same reasoning as `ssh-deploy-dispatcher.sh`'s
  `state/last_launch.log`: a still-running detached process writing to a
  `mktemp` file that got deleted out from under it silently loses its own
  output. Overwritten fresh on every new schedule.

Neither new file is deleted on normal cleanup completion — like
`deploy.lock.meta`, they're left as a breadcrumb of the last scheduled/fired
cleanup. `scheduled_cleanup.pid` is overwritten (not appended) by the next
`cmd_deploy`'s call to `schedule_cleanup` regardless of whether the previous one
already fired; a stale-but-harmless PID left in that file after its process has
long exited is fine, since every consumer of the file
(`cancel_scheduled_cleanup`, described next) already treats "PID recorded but
not alive" as the normal steady-state case, not an error.

### 3. Supersede via `kill`, not a systemd timer poll

**Round-1 review caught two implementation-breaking bugs in this decision's
original draft, both confirmed independently by multiple reviewers — fixed
below, not just noted:**

1. **The illustrative launch command didn't actually run.** The original draft
   gave it as `setsid bash -c 'sleep 1800 && exec deploy.sh --cleanup' &`. Two
   separate problems: bareword `deploy.sh` is not on `$PATH` (every other caller
   in this codebase, e.g. `ssh-deploy-dispatcher.sh`'s `launch()`, invokes it by
   absolute path), so `exec` would fail with "command not found"; and a
   _different_ earlier draft of decision 9 additionally assumed
   `exec "$0" --cleanup` inside that same `bash -c` string would resolve `$0` to
   the script's own path — but `bash -c 'STRING'` sets `$0` inside `STRING` from
   an explicit trailing positional argument after the string, defaulting to the
   literal word `"bash"` if none is given. Neither shape reaches `cmd_cleanup`.
   Verified empirically during review (`bash -c 'exec "$0"
   --cleanup'` →
   `bash: --cleanup: invalid option`; `bash -c 'exec deploy.sh --cleanup'` →
   `bash: line 0: exec: deploy.sh: not
   found`). Because decision 5 makes
   scheduling failures non-fatal to the deploy (by design) and log only to
   `scheduled_cleanup.log` (which nothing polls), this bug would have shipped
   silently — cleanup would still have happened, just via the hourly fallback
   (decision 8) instead of the 30- minute path, indistinguishable from "working
   as designed" without someone actually reading that log.
2. **The backgrounded process inherited the deploy lock's file descriptor and
   held it open for the full 30 minutes.** `acquire_deploy_lock`
   (`lib/lock.sh:9`) does `exec 9>"$LOCK_FILE"` in `cmd_deploy`'s own process
   and keeps that fd open for the process's entire lifetime — that's the
   mechanism the lock's release depends on (`lib/lock.sh:36`'s comment: "Lock is
   released automatically when fd 9 closes at process exit"). A plain `... &`
   background fork from inside that same process duplicates all open fds,
   including fd 9, into the child; neither `setsid` nor `disown` closes
   inherited fds. Without an explicit close, `sleep 1800` itself holds a working
   copy of the _same_ open file description — and therefore the same `flock` —
   for its entire runtime, even though `cmd_deploy` itself has already exited
   and reported success. Left unfixed, this would have blocked every other lock
   acquisition (a second deploy, a manual `--rollback`, a manual or fallback
   `--cleanup`) for up to `flock`'s 300s timeout, for nearly the entire
   30-minute window, on every single deploy — directly contradicting decision
   6's and decision 10's claims that the existing `flock` continues to serialize
   everything correctly. This is also the concrete reason the
   `ssh-deploy-dispatcher.sh` `launch()` analogy this decision leans on doesn't
   fully transfer: the dispatcher process that backgrounds `deploy.sh` never
   itself holds `acquire_deploy_lock`, so it has no stale fd to leak in the
   first place. `deploy.sh` scheduling its own background process from inside
   the lock-holding process is a materially different situation and needs an
   explicit `9>&-` close.

New function `cancel_scheduled_cleanup()` and `schedule_cleanup()` in
`deploy.sh` (or a new `lib/cleanup_schedule.sh`, mirroring the existing
one-concern-per-file split in `infra/vps/lib/`):

```bash
# Canonical launch shape — the only place this command is written out.
# Decision 2's meta-file description and the task list both refer back to
# this, rather than restating it.
schedule_cleanup() {
  local pid
  : >"$SCHEDULED_CLEANUP_LOG_FILE"
  setsid bash -c '
    exec 9>&-              # close the inherited deploy-lock fd — see the
                            # "held the lock open" bug fixed above
    sleep 1800
    exec "$0" --cleanup
  ' "$ROOT_DIR/deploy.sh" </dev/null >"$SCHEDULED_CLEANUP_LOG_FILE" 2>&1 &
  pid=$!
  disown
  # Written immediately after capturing $pid, before anything else that
  # could fail — see decision 5 for what happens if these writes themselves
  # fail (a narrow, accepted, non-fatal gap in this schedule's own
  # trackability, not in whether it actually runs).
  atomic_write "$SCHEDULED_CLEANUP_PID_FILE" "$pid" \
    || { log_warn "Failed to record scheduled_cleanup.pid (pid=$pid still running, untracked)."; return 1; }
  atomic_write "$SCHEDULED_CLEANUP_META_FILE" "$(cat <<EOF
pid=$pid
scheduled_by=$sha
scheduled_at=$(date -u +%FT%TZ)
fires_at=$(date -u -d '+1800 seconds' +%FT%TZ)
candidate_color_at_schedule=$candidate_color
EOF
)" || { log_warn "Failed to record scheduled_cleanup.meta (pid=$pid still running, untracked)."; return 1; }
  log_info "Scheduled cleanup of $current_color in 1800s (pid=$pid)."
}

cancel_scheduled_cleanup() {
  [[ -f "$SCHEDULED_CLEANUP_PID_FILE" ]] || return 0
  local pid
  pid="$(cat "$SCHEDULED_CLEANUP_PID_FILE" 2>/dev/null)" || pid=""
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null \
     && grep -qE 'sleep|deploy\.sh' "/proc/$pid/cmdline" 2>/dev/null; then
    log_info "Cancelling previously scheduled cleanup (pid=$pid)."
    kill -TERM "$pid" 2>/dev/null || true
  fi
  rm -f "$SCHEDULED_CLEANUP_PID_FILE" "$SCHEDULED_CLEANUP_META_FILE"
}
```

Called from `cmd_deploy`, right before scheduling a fresh one (decision 1),
**both wrapped by decision 5's non-fatal guard** — not just `schedule_cleanup`,
see decision 5.

**The `/proc/$pid/cmdline` check exists because of a PID-reuse hazard flagged
independently by two reviewers**: decision 2 deliberately leaves
`scheduled_cleanup.pid` in place, unmodified, for as long as it takes for the
_next_ `cmd_deploy` to run — which per decision 6 can be well over 30 minutes if
the only intervening activity is a `--rollback` (which never touches this file).
A bare `kill -0 "$pid"` treats "some process with this PID happens to be alive"
as equivalent to "the scheduled cleanup is still pending," which isn't true once
the kernel has recycled that PID number for an unrelated process — a real risk
on a long-uptime VPS with normal cron/systemd/docker process churn between
deploys. The `cmdline` check is a cheap, not-bulletproof mitigation (an
unrelated process could coincidentally match the pattern), but it closes the
realistic case of "signal a completely unrelated long-lived process" that a bare
PID check does not.

**Why plain `kill -TERM $pid` on the top-level backgrounded process is
sufficient**, without needing a process-group kill, once the fd-9 leak above is
fixed and given the `cmdline` check confirms the right process: while the child
`sleep` is running, `$pid` is the `bash -c` process; SIGTERM's default
disposition kills it immediately. The orphaned `sleep` keeps running for its
remainder, but that's harmless — there is no longer a parent shell alive to run
the exec'd `deploy.sh --cleanup` once `sleep` exits, so the chain is already
broken. Two residual caveats, both asserted rather than verified against the
real VPS (per the blue/green plan's Status section, T11 — the first real
production cutover — hasn't run yet as of this writing): (a) if the kill instead
lands on a process that has already exec'd into `deploy.sh --cleanup` and is
itself blocked inside `acquire_deploy_lock`'s own `flock -w 300 9` call, that
`flock` is a genuinely forked external command (`lib/lock.sh:10`) — killing its
parent can leave a short-lived orphaned `flock` process still waiting on the
lock for up to its own 300s, harmless but potentially confusing to an operator
inspecting `ps` shortly after a supersede; (b) `setsid CMD &` run
non-interactively is assumed here to fork exactly once, so that `$!` captures
the actual long-running process rather than a short-lived intermediate —
util-linux `setsid` only double-forks when it detects it's already a
process-group leader, which shouldn't be the case inside a non-interactive
forced-command SSH session with job control off, but this hasn't been confirmed
against the real VPS either. Neither caveat threatens correctness: decision 4's
fresh-state-read backstop inside `cmd_cleanup` is what correctness actually
depends on; `kill` here is a best-effort optimization to avoid a needless future
lock wait and a spurious no-op `history.log` line.

**Why not the migration-watchdog's systemd-timer-plus-timestamp-file pattern
instead** (this was seriously considered, given the working precedent noted
above): a per-minute systemd timer checking a `cleanup_due_at` timestamp file
would survive a VPS reboot for free (see decision 7), which the `setsid`
approach does not. Rejected here anyway, for two reasons: (a) the task's own
framing is explicit about mirroring `ssh-deploy-dispatcher.sh`'s `launch()`
detachment model — a self-scheduling `deploy.sh`, not a second provisioning-
time artifact; introducing one more systemd unit (install step, `Step 8` doc
update, `.service`/`.timer` files to maintain) is real added surface for a gap
this plan accepts as a documented trade-off, not a gap it's required to close
outright (decision 7). (b) The watchdog timer's job is fundamentally different
in shape: it re-evaluates a **continuously-true-or-false condition** every
minute forever. Cleanup scheduling is a **one-shot delayed action per deploy**
with a supersede requirement — forcing that into "a timer that always runs,
checking a due-at timestamp" adds a permanently-installed unit for what's
naturally a single `sleep`. If the reboot gap is later judged unacceptable, the
fix is additive (a boot-time check, decision 7), not a reason to abandon this
design now.

### 4. The fired cleanup re-reads state, doesn't snapshot it

The backgrounded chain calls plain `deploy.sh --cleanup` (`cmd_cleanup`,
[deploy.sh:292-323](../../infra/vps/deploy.sh#L292-L323)) unmodified — no new
`--cleanup-equivalent` subcommand, no color/target argument passed in from
schedule time. `cmd_cleanup` already:

- acquires the same `flock` (`acquire_deploy_lock "cleanup"`) every other entry
  point uses,
- re-reads `state/current_color`/`state/rollback_target` **fresh, at fire
  time**, not from anything captured 30 minutes earlier,
- no-ops safely if `rollback_target` is empty or equals `current_color` (lines
  302-309).

This is deliberate and preserves the exact guarantee `cd.yml`'s current comment
already documents ([cd.yml:193-202](../../.github/workflows/cd.yml#L193-L202)):
"no explicit cancellation logic is needed for an in-window
`deploy.sh --rollback`: rollback rewrites `state/rollback_target` to whatever
color is now correctly benched, so this job's plain `deploy.sh --cleanup` call
(state-driven, checked against current_color server-side) tears down the right
color regardless of whether a rollback happened in between." Moving the
scheduling server-side changes _when_ `--cleanup` gets invoked, not _what it
looks up_ — so this property carries over unchanged. See decision 6 for why this
also means `cmd_rollback` must not cancel a pending schedule.

Because `cmd_cleanup` is already idempotent by construction, `kill`-based
supersede (decision 3) is a hygiene/efficiency optimization — avoiding a
needless future `flock` wait and a spurious no-op `history.log` line — **not**
the thing preventing a stale cleanup from tearing down the wrong color. Even if
`kill` silently failed to prevent a stale process from firing, the worst case is
one extra idempotent no-op invocation of `cmd_cleanup`, not incorrect teardown.

### 5. Scheduling must never fail the deploy

`cmd_deploy` currently ends its success path at
[deploy.sh:227-229](../../infra/vps/deploy.sh#L227-L229) after
`state_committed`. The whole file runs under `set -euo pipefail`
([deploy.sh:22](../../infra/vps/deploy.sh#L22)), so any unguarded failing
command inside a new `schedule_cleanup()` call — a `setsid` binary missing, a
disk-full `atomic_write`, whatever — would abort the entire script and, via
`on_exit`'s trap, report the just-completed cutover as `outcome=failure`. That
would be a strictly worse failure mode than today: the cutover genuinely
succeeded; only the cleanup scheduling failed.

Both `cancel_scheduled_cleanup` and `schedule_cleanup` must therefore be called
guarded, not just the latter — a round-1 reviewer caught that an earlier draft
of this decision only wrapped `schedule_cleanup`, leaving
`cancel_scheduled_cleanup`'s own `cat "$SCHEDULED_CLEANUP_PID_FILE"` (a plain
command substitution assignment, not inside any `||`/`&&`) able to abort the
whole script under `set -e` on a transient read failure — e.g. permissions, or
the file vanishing between the `-f` check and the read — turning an
already-successful cutover into a falsely-reported `outcome=failure` exactly as
decision 5 exists to prevent, just via the sibling function it forgot to guard.

**A round-2 reviewer then caught that the outer `|| log_warn` guard alone is not
sufficient inside `schedule_cleanup` itself, and the fix has to be internal to
the function, not just at the call site.** When bash calls a function as
`func || fallback`, `errexit` is suppressed for that function's _entire body_,
not just its final statement — so an unguarded failing command partway through
`schedule_cleanup` (e.g. `atomic_write` failing on a full disk) does **not**
abort the function early; execution just continues to whatever the function's
actual last statement is. In the code block below, that's
`log_info "Scheduled cleanup..."`, a `printf`-style call that essentially never
fails — so the function returns 0 regardless of whether the `atomic_write` calls
before it succeeded, and the caller's `|| log_warn` **never fires**, silently
defeating the exact observability guarantee this decision claims to provide. The
fix (already reflected in decision 3's canonical code block above) is for
`schedule_cleanup` to explicitly check each `atomic_write` call itself —
`atomic_write ... || { log_warn "..."; return
1; }` — rather than relying on the
outer wrapper to catch failures buried mid-function. `cancel_scheduled_cleanup`
happens to avoid this same trap only by accident: its actual last statement
(`rm -f ...`) is the one operation whose failure would matter, and `rm -f`
essentially never fails — not because the function was designed against this
pitfall, just because of where it happens to end.

```bash
cancel_scheduled_cleanup || log_warn "Failed to cancel a previously scheduled cleanup — it may fire redundantly later; cmd_cleanup's own idempotent guards (decision 4) make this safe, not silently wrong."
schedule_cleanup || log_warn "Failed to schedule automatic cleanup — old color ($current_color) must be cleaned up manually via deploy.sh --cleanup."
```

Internally, both functions avoid `die` (which calls `exit 1`) in favor of
`log_warn` + `return 1` on every failure branch. `append_history` should still
record a `deploy sha=... outcome=success` line as today; a separate `log_warn`
(not a second history line) is enough for either failure, since
`releases/history.log`'s existing shape
(`deploy sha=... color=... outcome=... previous_color=...`) has no field for
this and shouldn't grow one for a best-effort side channel.

**Known, accepted narrow gap**: `schedule_cleanup`'s PID/meta writes necessarily
happen _after_ the `setsid ... &` fork (decision 3) — the PID to write doesn't
exist before that. If `atomic_write` itself then fails (e.g. disk full), the
background process is already running, untracked. This is not a correctness
hazard — per decision 4, `cmd_cleanup` at fire time re-reads state fresh
regardless of whether anything was tracking it — only an observability one: that
one schedule becomes uncancelable (the next deploy's `cancel_scheduled_cleanup`
finds no PID file and no-ops) and invisible to an operator reading
`scheduled_cleanup.meta`. Narrow enough (requires a write failure in the
few-millisecond window right after a successful fork) not to warrant additional
machinery.

### 6. `cmd_rollback` does not touch the schedule

Established in decision 4: an in-window `--rollback` deliberately leaves the
already-running scheduled cleanup alone, because that cleanup's state-driven
re-read at fire time is _how_ a rollback's bad candidate color gets torn down
without any bespoke cancellation logic — this is existing, working behavior from
`cd.yml`'s comment, not new. Explicitly **not** doing the following two
tempting-looking things:

- **Don't cancel the schedule on rollback.** Doing so would silently strand the
  rolled-back-from color running forever, since nothing else would ever clean it
  up.
- **Don't have `cmd_rollback` schedule a fresh 30-minute window of its own.**
  `cmd_rollback`'s own precondition
  (`[[ -n "$current_color" && -n "$target_color" ]] || die "No rollback
  target recorded"`,
  [deploy.sh:241](../../infra/vps/deploy.sh#L241)) means a rollback is only ever
  reachable while a `rollback_target` still exists — i.e., strictly before some
  cleanup (scheduled or manual) has already run. There is therefore always
  exactly one relevant pending-or-already-fired schedule in play whenever a
  rollback happens, inherited from whichever `cmd_deploy` call most recently
  committed state; reusing its already- ticking 30-minute clock (measured from
  the original cutover, not from the rollback) matches `cd.yml`'s current
  behavior exactly and needs no new timer. A round-1 reviewer flagged that a
  rollback executed late in the window (e.g. at t+29min) leaves only ~1 minute
  before the inherited schedule tears down the just-re-benched candidate — less
  time than an operator might expect to reconsider before it's gone. This is not
  a regression: today's `scheduled-cleanup` job is triggered by
  `needs: [gate, sync-and-deploy]` and starts its 30-minute clock from when
  `sync-and-deploy` completed, not from when any later rollback happens, so a
  late manual rollback already has exactly this same narrow grace period in
  production today. Flagging it here as an explicitly-inherited, not newly-
  introduced, limitation — worth a follow-up if it's ever judged unacceptable,
  but out of scope for a plan whose goal is behavior parity plus the GHA-cost
  fix.

### 7. VPS reboot during the 30-minute window

The scheduled cleanup is a plain OS process with no persistence — a reboot (or
an OOM-killer sweep, or `systemctl restart` of anything that takes the whole
machine down) loses it silently, exactly like a GitHub Actions outage loses
today's `sleep 1800` runner. **Accepted as-is, not fixed by this plan**, for two
reasons:

- It's a **narrower, though not strictly better in every dimension**, loss
  window than today's. In one direction it's a clear improvement: any GitHub
  Actions disruption at any point during the 30 minutes (a far more frequent
  event class than a VPS reboot, given GHA's shared-runner eviction policies)
  loses the cleanup today; after this change, only a VPS-local reboot inside
  that same window does. In another direction it's a genuine, not merely
  lateral, regression worth naming honestly rather than glossing over: today, a
  **brief, fully-recovered** VPS outage during the window — e.g. a sub- minute
  `unattended-upgrades` kernel reboot — has **no effect**, because the 30-minute
  timer lives on the GitHub-hosted runner, not the VPS; the runner just resumes
  its `sleep` and SSHes in successfully once the VPS is back. After this change,
  that same brief reboot **permanently** loses the schedule, because nothing
  about it persists across a VPS restart — there's no partial credit for "the
  VPS was down for under a minute." Net assessment: still an improvement in
  expected frequency of loss (VPS reboots of any kind are rarer than GHA-side
  disruptions), but the two failure modes aren't quite the apples-to-apples
  comparison the first sentence of this bullet originally implied.
- `restart: unless-stopped` is set on every app/infra service in
  `infra/vps/docker-compose.yml` except the deliberately one-shot `minio-init`
  (confirmed via `grep restart:` — `restart: "no"` there is correct, not an
  oversight), and documented at `docs/core/deploy.md:338-339`. This means
  **both** the live color's containers and the still-benched old color's
  containers come back up after a reboot — the stale old color doesn't just
  vanish on its own, it keeps occupying resources exactly as it would have
  without a reboot. So a lost scheduled cleanup after a reboot leaves the system
  in the _same_ state a lost GitHub Actions cleanup leaves it in today: stale
  containers running until someone notices or the fallback in decision 8 catches
  it.

If this gap is later judged unacceptable, the additive fix is a boot-time check
(e.g. a `systemd` oneshot on `multi-user.target` or the top of `deploy.sh`'s
next invocation) that reads `scheduled_cleanup.meta`'s `fires_at`, and if it's
in the past with no live process, immediately runs `deploy.sh --cleanup` once.
Not implemented here — flagged as a natural follow-up, not silently dropped.

### 8. What happens to `cd.yml`'s `scheduled-cleanup` job

**Delete the job's 30-minute wait; replace it with a much cheaper periodic
fallback, don't delete the safety net entirely.**

Reasoning: `cmd_cleanup` is idempotent and safe to call at any time (decision 4)
— a fallback that just runs `deploy.sh --cleanup` unconditionally on a
low-frequency cron is a no-op the overwhelming majority of the time and costs a
few seconds of runner time, not 30 minutes. This directly closes the residual
gap from decision 7 (reboot during the window) within, at worst, the fallback's
polling interval — something outright deleting the job would not do. Concretely:

- Remove the existing `scheduled-cleanup` job
  ([cd.yml:203-233](../../.github/workflows/cd.yml#L203-L233)) in full,
  including the `production-cleanup` concurrency group (no longer needed — there
  is nothing left in `cd.yml` for it to serialize against; the supersede
  guarantee now lives entirely in `deploy.sh` via decision 3).
- Add a new, separate scheduled workflow (e.g.
  `.github/workflows/cleanup-fallback.yml`) triggered by `schedule:` (a cron
  expression on the order of hourly — cheap enough that even a much shorter
  interval would be fine, but hourly is already well inside the acceptable
  staleness window for "stale containers occupying VPS resources," which is a
  resource-hygiene concern, not a correctness one) plus `workflow_dispatch:` for
  manual on-demand runs. **Must declare `environment: production`**, same as
  `sync-and-deploy` and today's `scheduled-cleanup` job — a round-1 reviewer
  caught that this was missing from the original draft of this decision, and
  without it the `DEPLOY_SSH_*` secrets (environment-scoped per decision 10 of
  the blue/green plan) simply aren't visible to the job, so `deploy-ssh-setup`
  fails on every run and the fallback silently never works — precisely
  reintroducing the "no retry, nobody notices" failure mode this plan exists to
  close, just one layer up. Steps: checkout (for the composite action), reuse
  `./.github/actions/deploy-ssh-setup` exactly as today's job does, one SSH call
  running `deploy.sh --cleanup`. No `sleep`, no 30-minute `timeout-minutes`, no
  `production-cleanup` concurrency group — **not** because GitHub queues
  same-workflow runs by default (it doesn't; an earlier draft of this bullet
  claimed this and it's factually wrong, corrected here — concurrent `schedule:`
  and `workflow_dispatch:` runs of the same workflow can and do execute in
  parallel without an explicit `concurrency:` block), but because
  `deploy.sh --cleanup`'s own `flock` (`cmd_cleanup` calls
  `acquire_deploy_lock`, [deploy.sh:293](../../infra/vps/deploy.sh#L293))
  already serializes any two overlapping SSH calls into it on the VPS side,
  making concurrent fallback runs harmless and idempotent regardless of what
  GitHub does or doesn't guarantee.
  - GitHub's `schedule:` trigger is documented as best-effort and can slip by
    tens of minutes under platform load — "hourly" is a target interval, not a
    guarantee; the reboot-gap closure claimed in decision 7 is bounded by
    "roughly hourly, subject to GitHub's own scheduling latency," not a hard
    SLA.
  - Because this trigger is no longer coupled to `needs: sync-and-deploy`
    (today's job only ever fires once per completed deploy chain; this one fires
    on a fixed clock regardless of deploy activity), an hourly tick has a real,
    if small, chance of landing during an active deploy's lock-held window and
    simply timing out on `flock`'s 300s wait. This is self- resolving and
    non-fatal — the fallback's own SSH call fails, the next hourly tick tries
    again, and in the meantime the deploy that's holding the lock has its own
    scheduled cleanup pending anyway (decision 1-3) — but worth noting as an
    expected, harmless failure shape rather than something to alert on if seen
    once in the fallback workflow's run history.
- `sync-and-deploy`'s `needs: [gate, build-push]` is unaffected; nothing in
  `sync-and-deploy` currently depends on `scheduled-cleanup`, so removing the
  latter is a pure subtraction there.

### 9. `deploy.sh` being rsynced mid-window

`cd.yml`'s sync step (`rsync -az --delete ... infra/vps/`,
[cd.yml:157-168](../../.github/workflows/cd.yml#L157-L168)) overwrites
`/opt/biasmarket/deploy.sh`'s bytes on every deploy, and per decision 7 of the
blue/green plan this is already guarded against clobbering a _running_
`deploy.sh` process (same remote `flock`, GHA's `production-deploy` concurrency
group serializing whole CD runs). The already-detached, already- sleeping
scheduled-cleanup process from a **previous** deploy is a different concern: it
is not holding the lock while it sleeps (only `cmd_cleanup` itself acquires the
lock, at fire time, well after the 1800s `sleep` returns), so a new deploy's
rsync can and will overwrite `deploy.sh` while an old schedule is still counting
down.

The previous chain's `exec "$0" --cleanup'` (decision 3's corrected form)
resolves `$0` — the path to `deploy.sh`, passed as the `bash -c` positional
argument — **at exec time, after `sleep` returns**, not at schedule time. By the
time that `exec` runs, it picks up whatever `deploy.sh` currently exists on disk
at that path — i.e., the **newer**, just-synced version, not a stale in-memory
copy of the old one. This is the desired behavior: the fired cleanup should run
under the current `deploy.sh`'s `cmd_cleanup` logic, not a 30-minute-stale one,
exactly as `--wait-for-result` and `--print-current-sha` already assume
"whatever's on disk right now" is authoritative.

**Corrected mechanism** (a round-1 reviewer caught that the original draft's
stated reasoning here was wrong, even though its conclusion for the single-file
case happened to be right): the safety is not "POSIX guarantees `execve` reads
the whole file before running it" — for an interpreted `#!` script, the kernel's
`execve()` doesn't read the script's content at all, it re-execs the `bash`
interpreter with the script's path as an argument; it's `bash` itself that
subsequently opens and reads that path. The actual guarantee is simpler and
comes from two well-established, unrelated properties: (a) `cd.yml`'s
`rsync -az --delete` (no `--inplace`) writes each transferred file to a temp
name and renames it over the target, which is atomic at the filesystem level, so
a reader that `open()`s the path either gets the fully-old or fully-new content,
never a torn mix of both; and (b) a process that has already `open()`ed a file
continues reading that same inode even if the path is renamed out from under it
mid-read. Between them, `deploy.sh` itself is never read as a torn file.

**What this does _not_ cover, and what does need to be named explicitly**: a
single file's atomicity says nothing about the **set** of files `deploy.sh`
sources at startup — 8 separate `lib/*.sh` files, each `source`d individually
([deploy.sh:26-41](../../infra/vps/deploy.sh#L26-L41)), all _before_
`cmd_cleanup` ever calls `acquire_deploy_lock`. `rsync`ing a whole directory
tree updates its files one at a time, not as a single atomic unit. A normal
CD-triggered deploy never has to worry about this, because the rsync step fully
completes before `launch()` ever execs `deploy.sh` in the same job run — there's
a real ordering dependency, not just a race. The scheduled cleanup's `exec`, by
contrast, fires on an independent ~1800s timer with **no ordering relationship**
to any _other_ deploy's concurrent rsync, and decision 9's own single-file
argument doesn't extend to it. Concretely: if a second deploy's rsync is caught
mid-transfer — `deploy.sh` already replaced with a new version, `lib/state.sh`
not yet replaced (or vice versa) — at the exact moment a first deploy's
scheduled cleanup fires its `exec`, the resulting process sources a
version-mismatched combination of old and new lib code. Under
`set -euo pipefail`, a newer `deploy.sh` referencing a constant a not-yet-synced
`lib/state.sh` doesn't define yet would abort with an unbound- variable error
(an unhandled crash inside the backgrounded process — not a deploy-time failure,
so it wouldn't even reach decision 5's guard, only `scheduled_cleanup.log`).

This window is narrower than it first sounds — it only exists for commits that
change `infra/vps/lib/*.sh` content in a way that lands during another deploy's
active rsync (rsync only re-transfers files whose content actually changed, so a
deploy that doesn't touch `lib/*.sh` poses no risk to a concurrently-firing
cleanup) — but it's real and this plan doesn't fully close it. **Recommended
mitigation, added to the task list**: add `--delay-updates` to `cd.yml`'s rsync
invocation ([cd.yml:162](../../.github/workflows/cd.yml#L162)), which stages all
transferred files in a hidden temp directory and performs the renames as a
single final pass — this meaningfully narrows the window (from "however long the
whole transfer takes" to "the brief instant of the final rename pass") without
closing it to zero. Treating full closure as out of scope for this plan: it
would require either quiescing scheduled-cleanup fires during an active rsync
(new coordination this plan's whole point was to avoid needing) or a stricter
multi-file atomicity mechanism (e.g. syncing to a versioned directory and
swapping a symlink) that's a larger change than this plan's stated goal.

### 10. `PID`-file tracking does not need its own version/generation field

Considered and rejected as unnecessary complexity: tagging
`scheduled_cleanup.pid`/`.meta` with a monotonic generation counter (so a racing
`cancel` vs. `schedule` pair can't clobber each other's writes) is redundant
given `cmd_deploy` already runs the entire `cancel_scheduled_cleanup` →
`schedule_cleanup` sequence **while holding the deploy lock**
(`acquire_deploy_lock "deploy:$sha"` is the very first thing `cmd_deploy` does,
[deploy.sh:143](../../infra/vps/deploy.sh#L143), released only on process exit).
Two `cmd_deploy` invocations can never run this sequence concurrently with each
other — the existing `flock` already serializes it. The only genuinely
concurrent actor is the previously- scheduled background process itself, and
decision 4 already establishes that its behavior at fire time depends solely on
fresh state reads inside `cmd_cleanup`, not on anything written to the PID/meta
files — so those files have no correctness-critical concurrent-write hazard to
guard against, only the "who/what is pending" observability purpose from
decision 2.

This claim is only true given decision 3's fd-9 fix. Before that fix (i.e. in
this doc's original draft), the sleeping background process silently held the
deploy lock open for its full 30-minute runtime, which would have meant a
_second_ `cmd_deploy` couldn't even reach its own `acquire_deploy_lock` call
during that window — not "serialized safely," but "blocked and eventually timed
out." A round-1 reviewer traced this exact interaction and confirmed that once
the background process properly closes fd 9 at launch, the serialization
argument in this decision holds as originally intended: the background process
is a plain `sleep` (no lock held) until it execs into `cmd_cleanup`, at which
point it contends for the lock exactly like any other caller.

## Edge cases summary (cross-reference)

| Scenario                                                                                                                                 | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Decision                            |
| ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Second CD-triggered deploy lands before first's 30-min window elapses                                                                    | Blocked by the existing `rollback_target == candidate_color` guard (`deploy.sh:167-169`) unless `--force` is passed — `cd.yml` never passes `--force`, so this is unreachable via normal CD                                                                                                                                                                                                                                                              | n/a (pre-existing guard, unchanged) |
| Manual `--force` deploy lands into the still-pending slot                                                                                | Runs the same `cmd_deploy` as any other invocation, so it **actively** calls `cancel_scheduled_cleanup` then `schedule_cleanup` itself — the old schedule is killed and replaced, not left to fire-and-no-op later. (An earlier draft of this table row described the wrong mechanism — "left to no-op" — corrected here; the end state is the same either way, backstopped by decision 4, but the actual sequence of events is cancel-then-reschedule.) | 1, 3, 4                             |
| `--rollback` run manually during the window                                                                                              | Pending schedule fires later against the fresh (rolled-back) `rollback_target`, tearing down the correct (bad candidate) color — unchanged from today's `cd.yml`-comment-documented behavior                                                                                                                                                                                                                                                             | 4, 6                                |
| VPS reboot during the window                                                                                                             | Scheduled cleanup lost silently, with no exception for a reboot that fully recovers within the window (unlike today's GHA-side `sleep`, which does tolerate a brief VPS outage) — net still a narrower loss window than today's, closed within roughly the fallback's polling interval, GitHub scheduling latency permitting                                                                                                                             | 7, 8                                |
| `deploy.sh` rsynced mid-window (next deploy's sync step)                                                                                 | Safe for `deploy.sh` itself — the chain resolves `$0` at fire time via `exec`, always running the current on-disk `deploy.sh`, never a torn single-file read                                                                                                                                                                                                                                                                                             | 9                                   |
| A commit changing `infra/vps/lib/*.sh` is being rsynced by a second deploy at the exact instant a first deploy's scheduled cleanup fires | Not fully closed by this plan — the fired process can source a version-mismatched mix of old/new lib files and crash with an unbound-variable error inside the backgrounded process (visible only in `scheduled_cleanup.log`); narrowed by recommending `rsync --delay-updates`, not eliminated                                                                                                                                                          | 9                                   |
| Two deploys' schedules racing each other                                                                                                 | Cannot happen — both `cancel_scheduled_cleanup`/`schedule_cleanup` calls run under `cmd_deploy`'s own `flock`, and (once decision 3's fd-9 fix is in place) the background process itself holds no lock while sleeping                                                                                                                                                                                                                                   | 3, 10                               |

## Task list

1. `lib/state.sh`: add `SCHEDULED_CLEANUP_PID_FILE`,
   `SCHEDULED_CLEANUP_META_FILE`, `SCHEDULED_CLEANUP_LOG_FILE` path constants.
2. New `lib/cleanup_schedule.sh` (sourced from `deploy.sh` alongside the other
   `lib/*.sh` files): `cancel_scheduled_cleanup()` (decision 3, including the
   `/proc/$pid/cmdline` identity check) and `schedule_cleanup()` (decisions 1,
   2, 3, 5 — including the `exec 9>&-` fd close and the `$0` passed as an
   explicit `bash -c` positional argument; see decision 3's corrected code
   block, the canonical shape, not to be restated differently elsewhere).
3. `cmd_deploy`: call `cancel_scheduled_cleanup || log_warn ...` then
   `schedule_cleanup || log_warn ...` (both guarded, decision 5) right after the
   `state_committed` phase's `phase "state_committed"` call (i.e. _after_ line
   225, not interleaved before it — an earlier draft placed this before the
   `phase` call, which would have left `deploy.lock.meta`'s live `phase=` field
   reading `full_switch` during scheduling instead of accurately reflecting
   `state_committed`).
4. No changes to `cmd_cleanup`, `cmd_rollback`, or `ssh-deploy-dispatcher.sh`
   (decisions 4, 6 — `--cleanup` is already reachable through the existing
   dispatcher allowlist, which is all the fallback workflow needs).
5. `.github/workflows/cd.yml`: delete the `scheduled-cleanup` job and the
   `production-cleanup` concurrency group (decision 8); add `--delay-updates` to
   the existing rsync step's flags (decision 9's mitigation for the multi-file
   lib-sourcing race — a small, independent hardening that also benefits every
   other consumer of that rsync step, not just this plan).
6. New `.github/workflows/cleanup-fallback.yml`: `schedule:` (hourly cron) +
   `workflow_dispatch:`, **`environment: production`** (decision 8 — easy to
   miss, called out explicitly because two reviewers independently flagged its
   absence as implementation-blocking), reusing
   `./.github/actions/deploy-ssh-setup`, one SSH call to `deploy.sh --cleanup`
   (decision 8).
7. Fix the stale `systemd-run --scope --unit=biasmarket-deploy` sentence in
   `2026-08-10-bluegreen-zero-downtime-deploy-plan.md`'s decision 8 to say
   `setsid`, matching what's actually implemented (called out in Context above).
8. `docs/core/blue-green-migrations.md`: document the new
   `scheduled_cleanup.{pid,meta,log}` state files and the fallback workflow
   alongside the existing state-file documentation, so an operator debugging the
   VPS has a reference for what these are — explicitly including the caveat that
   `candidate_color_at_schedule` in `scheduled_cleanup.meta` is a snapshot, not
   authoritative at fire time (decision 2), and that a stray orphaned `flock`
   process transiently visible in `ps` shortly after a supersede is expected,
   not a symptom to chase (decision 3).

## Related findings, out of scope for this plan

Noted here per the review brief's instruction to surface related bugs/risks seen
in surrounding code, not silently drop them — none of these block or require
changes for this plan to land; they're independent, pre-existing observations
from round-1 review.

- **`cmd_cleanup` never calls `phase "reconciled"`** after
  `reconcile_state_with_reality()`
  ([deploy.sh:295](../../infra/vps/deploy.sh#L295)), unlike `cmd_deploy` and
  `cmd_rollback`, which both do. Cosmetic — `deploy.lock.meta`'s live `phase=`
  field stays `lock_acquired` through reconciliation during a cleanup run —
  pre-existing, unrelated to this plan. Worth a one-line fix independently,
  since this plan multiplies how often `cmd_cleanup` runs unattended (every
  scheduled fire, plus the new hourly fallback).
- **`cd.yml`'s `production-cleanup` concurrency group (being deleted by this
  plan anyway) appears to have already been largely dead code before this
  plan.** Its stated purpose is canceling a stale first `scheduled-cleanup` job
  when a second deploy's own `scheduled-cleanup` job starts — but a second
  CD-triggered deploy within the 30-minute window already fails at
  `cmd_deploy`'s `rollback_target == candidate_color` guard, failing
  `sync-and-deploy`, which means the downstream `scheduled-cleanup` job
  (`needs: [gate, sync-and-deploy]`) is skipped by GitHub's own needs-success
  semantics before a second instance of that job ever exists to race the first.
  Not actionable here since the whole job is being removed regardless, but worth
  knowing this wasn't actually protecting much even before this plan.
- **Neither the old `scheduled-cleanup` job nor the new `cleanup-fallback.yml`
  can confirm a cleanup actually succeeded, only that it launched.**
  `cmd_cleanup` sets `CURRENT_SHA_FOR_RESULT="cleanup:${target:-none}"`, a
  string that can never match `--wait-for-result`'s 40-hex-SHA-anchored regex
  (`ssh-deploy-dispatcher.sh:90`), so there's no way to route a cleanup
  invocation through `--wait-for-result` even if someone wanted synchronous
  confirmation. Pre-existing limitation, not introduced by this plan, but this
  plan's own `schedule_cleanup` inherits the same blind spot (decision 2 and 5's
  log-based observability is the only visibility into a fired cleanup's actual
  outcome).
