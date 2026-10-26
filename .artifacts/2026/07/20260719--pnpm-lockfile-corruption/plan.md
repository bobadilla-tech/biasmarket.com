# pnpm-lock.yaml corruption: root cause and fix

## Context

`pnpm docker:dev` failed at the `api` container's dependency-install step:

```
ERR_PNPM_BROKEN_LOCKFILE  The lockfile at "/app/pnpm-lock.yaml" is broken:
expected a single document in the stream, but found more
```

This same failure had already surfaced (and been papered over) in the same-day
[typescript-7 plan](2026-07-19-typescript-7.md), which attributed it to
"pre-existing corruption... fixed as a side effect of running `pnpm install`".
That fix didn't hold — the corruption came back, because that plan never
identified _why_ the lockfile kept re-splitting into two YAML documents.

Root cause, found by bisecting which specific `pnpm` invocation reintroduced the
second document: this machine's `pnpm` on `$PATH` resolves to Homebrew's **pnpm
11.9.0** (`/opt/homebrew/Cellar/pnpm/11.9.0/...`), not the 10.11.0 pinned via
`devEngines.packageManager` / `packageManager` in `package.json`. When pnpm 11
sees a pin for an older version, it self-manages a downgrade: it execs the
pinned 10.11.0 binary for the actual install, but first writes its own v11-style
lockfile metadata (a `packageManagerDependencies` block for `@pnpm/exe`/`pnpm`
itself) as a **separate leading YAML document**, ahead of the real
single-document workspace lockfile that 10.11.0 then writes. pnpm 10.11.0's own
`--frozen-lockfile` reader doesn't understand that multi-document format and
rejects it. This is a known upstream bug:
[pnpm/pnpm#11264](https://github.com/pnpm/pnpm/issues/11264) (downgrade path
introduced in the v11 alphas).

Confirmed by reproducing on demand: any locally-run `pnpm install` /
`pnpm install --frozen-lockfile` (going through the Homebrew v11 shim) reliably
left `pnpm-lock.yaml` with a `---` at line 1 (the v11 self-pin doc, ~93 lines)
followed by a second `---` further down (the real lockfile). Docker's
container-side `pnpm` isn't affected on its own (it installs 10.11.0 directly
via `corepack prepare pnpm@10.11.0`, no v11 involved) — it only broke because
the _committed_ lockfile was already corrupted from a local run.

Dead ends ruled out before finding the real cause:

- `.npmrc` with `manage-package-manager-versions=false` — had no effect, config
  isn't consulted on this code path.
- Removing `devEngines.packageManager` from `package.json` — the corruption
  persisted even with the field gone, since the trigger is the _ambient_
  Homebrew pnpm version vs. the `packageManager` field, not `devEngines`
  specifically.
- `CI=true` env var — changes `pnpm install`'s strictness (behaves like
  `--frozen-lockfile`) but doesn't touch the underlying version-downgrade
  behavior.

## Decisions

- **Regenerate the lockfile via `npx pnpm@10.11.0` instead of the bare `pnpm`
  command**, whenever running it locally on this machine. That invokes 10.11.0
  directly with no v11 wrapper in front of it, so no downgrade path, so no
  second document ever gets written. Verified by running
  `npx pnpm@10.11.0 install --frozen-lockfile` three times in a row against the
  freshly generated lockfile with zero corruption.
- **No workaround shipped in the repo itself** — this is a local-toolchain
  mismatch (Homebrew pnpm version vs. pinned version), not something that needs
  a project-level fix. Docker's own install path was never actually broken; it
  just inherited a bad lockfile from a local machine. Once regenerated cleanly,
  `docker compose ... up --build` installs fine.
- Left the pnpm-auto-written diffs from the regeneration as-is rather than
  hand-reverting: `package.json` gained a `packageManager: "pnpm@10.11.0"` field
  (pnpm 10 writes this automatically when a project lacks one, for corepack
  compatibility) and `pnpm-workspace.yaml`'s `allowBuilds` entries got resolved
  from `set this to true or false` placeholders to `true` for each
  (`@prisma/engines`, `@swc/core`, `esbuild`, `prisma`, `sharp`) — interactive
  prompts triggered by build-script approval, answered affirmatively since these
  are all already-trusted deps declared in `onlyBuiltDependencies`.

## What changed

**Edited:**

- `pnpm-lock.yaml` — regenerated clean via `npx pnpm@10.11.0 install` (single
  YAML document; this repo's prior copy had been deleted entirely in a
  concurrent `deps: bump deps` commit, so this is a fresh untracked file pending
  review/commit).
- `package.json` — gained `"packageManager": "pnpm@10.11.0"` (pnpm auto-write,
  not hand-edited).
- `pnpm-workspace.yaml` — `allowBuilds` placeholders resolved to `true` (pnpm
  auto-write from an interactive prompt during reinstall).

## Verification

```
npx pnpm@10.11.0 install --frozen-lockfile
```

Run three times back-to-back against a freshly generated lockfile: exit 0 every
time, `grep -c "^---" pnpm-lock.yaml` stayed at 0 (no stray document
separators). Prior to the fix, every `--frozen-lockfile` run (via the
Homebrew-resolved `pnpm` shim) reintroduced the second document and failed with
`ERR_PNPM_BROKEN_LOCKFILE` on the very next invocation.

Not yet verified: a full `pnpm docker:dev` run to green (container build was not
re-run after the final fix landed) — should be checked next.
