# Plan: fix `set: Illegal option -` in docker dev scripts on Windows

Status: ready (self-reviewed only, see review-log.md)
Date: 2026-10-29. No ticket (reported by Daniel Jacquin in chat).

## 1. Context and outcome

Daniel runs `pnpm docker:dev` and `api` and `workers` exit with:

```
infra/docker/scripts/workers-dev.sh: 5: set: Illegal option -
infra/docker/scripts/api-dev.sh: 7: set: Illegal option -
```

(`web-1` also never started in his Docker Desktop screenshot; `web-dev.sh` is
the same shape, so it very likely hits the same error.)

Outcome: `pnpm docker:dev` works from a Windows checkout with default git
settings (`core.autocrlf=true`) without manual steps.

## 2. Root cause (fact, reproduced)

- The scripts are bind-mounted (`infra/docker/docker-compose.dev.yml:96,135,170`,
  `- ../..:/app`) and run with `sh` in `node:24-slim` (`workers.Dockerfile:11`),
  i.e. dash.
- Line 5 of `workers-dev.sh` and line 7 of `api-dev.sh` are exactly `set -e`.
  With CRLF endings the argument is `-e\r`; dash prints
  `set: Illegal option -` and the `\r` returns the cursor so `e` is hidden.
  That is why the message ends in a bare `-`.
- Repo has **no `.gitattributes`**. Index blobs are LF (`git ls-files --eol`
  shows `i/lf w/lf` for all three scripts), but a Windows clone with
  `core.autocrlf=true` (Git for Windows default) checks them out as CRLF.
  `.editorconfig` has `end_of_line = lf` but git does not read it.
- Not a script content bug: macOS/Linux/CI are unaffected.

Probe (scratchpad, not committed):
`/private/tmp/claude-501/-Users-ultirequiem-ulti-biasmarket-com/498a6d99-5d0b-41bc-9a22-d3c4e75f8b4f/scratchpad/crlf.sh`
= `workers-dev.sh` with `\r` appended per line. `dash crlf.sh` prints
`crlf.sh: 5: set: Illegal option -`. Matches the report character for
character. Result: root cause confirmed; no need to ask Daniel for more logs.

Other exposed files: every tracked `*.sh` (`infra/vps/**`, `scripts/ci/**`)
plus anything executed in Linux containers/VPS. Windows contributors running
those locally hit the same class of bug.

## 3. Design

Add a root `.gitattributes`:

```
* text=auto eol=lf
*.sh text eol=lf
*.png binary
```

(Keep it minimal; `text=auto` already treats the repo's PNGs as binary. Check
`git ls-files --eol | grep -- '-text'` for other binaries and list extensions
explicitly only if `git add --renormalize .` shows unwanted diffs.)

Non-goals: no change to the scripts, compose file, Dockerfiles; no CRLF-stripping
wrapper (`tr -d '\r'`) in compose, which would hide the real problem; no new
CI job (the 7-place wiring in `docs/core/ci.md` is not worth it for this; the
attribute is the guard).

## 4. Files

- add `.gitattributes`
- change `docs/core/` or README dev-setup section (find where `pnpm docker:dev`
  is documented): short "Windows" note with the recovery commands in section 7.

## 5. PR stack

Single PR, base `main`, branch `fix/gitattributes-lf-eol`. Scope: the two files
above. Must not change: scripts, compose, lockfile, any source file. CI only
runs on PRs to `main` (`ci.yml` `on:`), fine for a single PR.

## 6. Steps and completion signals

1. Create `.gitattributes`. Signal: file exists.
2. `git add --renormalize . && git status --short`. Signal: **no** modified
   files other than `.gitattributes` (index is already LF). If files show up,
   stop, they have CRLF in the index; list them in the PR and ask.
3. Local verification on a CRLF checkout (section 7). Signal: `file` reports no
   "CRLF" for the three scripts and `dash infra/docker/scripts/workers-dev.sh`
   gets past line 5 (it will then fail on pnpm outside docker; that is fine,
   look only for the `set` error; or run with `sh -n`).
4. Docs note. Signal: `pnpm fix` clean (prettier on md).
5. Open PR.

## 7. Test strategy

Planned, not run in the plan session:

- Simulate Windows: `git -c core.autocrlf=true clone . <scratch>/win` after the
  `.gitattributes` commit exists; then
  `git ls-files --eol` in the clone must show `w/lf` for `*.sh`, and
  `sh -n infra/docker/scripts/*.sh` passes.
- Negative control on `main` (no attributes): same clone shows `w/crlf`, and
  `dash infra/docker/scripts/workers-dev.sh` prints the Illegal option error.
- `pnpm lint` untouched files; no unit tests affected.
- Real confirmation: ask Daniel to run the recovery below and `pnpm docker:dev`.

Recovery for an existing Windows clone (goes in docs and the reply to Daniel;
commit or stash work first, since `reset --hard` discards changes):

```
git pull
git rm --cached -r . -q
git reset --hard
```

Quick unblock before the fix is merged: `git config core.autocrlf input`, then
the same three commands. Or work inside WSL.

## 8. Risks

- `* text=auto eol=lf` renormalizes on contributors' next checkout; mixed-EOL
  files in the index would show as modified. Step 2 detects this.
- Binary misdetection: unlikely; `text=auto` sniffs content. Step 2 detects it.
- Existing Windows clones stay broken until re-checkout: documented.
- Rollback: delete `.gitattributes`.

## 9. Acceptance criteria

- `.gitattributes` on `main` forces LF for `*.sh`.
- Fresh `core.autocrlf=true` clone has LF scripts and `sh -n` passes.
- `git add --renormalize .` yields no other diff.
- Docs mention the Windows recovery.
- Daniel confirms `api`, `workers`, `web` start.

## 10. Open questions

1. Scope of the attribute: recommended default is `* text=auto eol=lf` +
   `*.sh text eol=lf`. A narrower `*.sh text eol=lf` only is also safe; use it
   if step 2 shows unexpected diffs.
2. Confirm Daniel is on Windows with default autocrlf (strong inference from
   the dash `\r` symptom and Docker Desktop UI; not verified). If he is on
   macOS/Linux, stop and re-investigate (`file infra/docker/scripts/*.sh`).
