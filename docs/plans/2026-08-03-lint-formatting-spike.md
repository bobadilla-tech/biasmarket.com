# Linting and formatting spike

## Context

Ask was to quickly check whether the repo has linting/formatting set up and
record the result. The current state is intentionally awkward because the repo
is already leaning into TypeScript 7, which is good and should not be rolled
back just to satisfy older tooling.

TypeScript 7's native compiler path is faster and worth keeping, but a lot of
the JavaScript tooling ecosystem still assumes the old `typescript` compiler API
exists behind `require("typescript")`. That is the same underlying reason
ESLint/`typescript-eslint`, Next's historical lint stack, and other type-aware
tooling are painful here. The right posture is to wait for the ecosystem to
catch up, then reintroduce linting on top of tools that actually support the
repo's TypeScript version instead of pinning the project back to TypeScript 5/6.

## Findings

- Root `package.json` has a `lint` script wired to `turbo run lint`.
- `turbo.json` declares a `lint` task.
- GitHub Actions still calls lint for both `api` and `web`.
- `apps/api` has a `format` script using Prettier, plus an API-local
  `.prettierrc`.
- `apps/api` does not currently define a `lint` script.
- `apps/web` does not currently define `lint` or `format` scripts.
- No root ESLint, Biome, or Prettier config was found.
- The lockfile still contains transitive ESLint-related packages through other
  dependencies, but there is no project-level lint setup to run directly.

## Decisions

- **Do not drop TypeScript 7 just to make ESLint happy.** The TypeScript 7 move
  is a deliberate direction for the repo. Tooling should adapt to that choice,
  not force the application back onto the old compiler package shape.
- **Treat linting as temporarily unimplemented, not forgotten.** The root Turbo
  task and CI steps show linting is part of the intended pipeline, but the
  package scripts/configs no longer exist after the TypeScript 7 migration.
- **Keep formatting narrow for now.** Only `apps/api` has an explicit Prettier
  command today. There is no workspace-wide formatting command yet.
- **Revisit when the ecosystem catches up.** Once ESLint/TypeScript ESLint,
  Biome, Next's lint integration, or another candidate has clean TypeScript 7
  support, add a repo-wide lint/format setup and make the CI `lint` steps real
  again.

## What changed

**New:**

- `docs/plans/2026-08-03-lint-formatting-spike.md` — records the linting and
  formatting spike, including the TypeScript 7 ecosystem constraint.

No application code, package scripts, dependencies, or CI files were changed in
this spike.

## Verification

Static repo inspection checked:

```
package.json
turbo.json
.github/workflows/ci.yml
apps/api/package.json
apps/web/package.json
packages/*/package.json
apps/api/.prettierrc
```

Attempted to run:

```
pnpm lint
```

That command did not reach Turbo. The local pnpm launcher failed while trying to
switch to pinned `pnpm@10.11.0`, reporting that the registry signature/fetch for
the selected pnpm package could not be verified. That is separate from the lint
setup itself, but it means the spike could not confirm runtime Turbo behavior
from this shell.
