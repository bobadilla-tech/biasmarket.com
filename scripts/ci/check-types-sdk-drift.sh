#!/usr/bin/env bash

set -euo pipefail

pnpm --filter @biasmarket/types generate

if ! git diff --exit-code -- packages/types/generated ||
  [ -n "$(git status --porcelain --untracked-files=all -- packages/types/generated)" ]; then
  echo "packages/types/generated is out of date. Run" >&2
  echo "  pnpm --filter api generate:openapi && pnpm --filter @biasmarket/types generate" >&2
  echo "and commit the result." >&2
  exit 1
fi
