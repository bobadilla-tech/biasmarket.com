#!/usr/bin/env bash

set -euo pipefail

test -s apps/api/openapi.json
git ls-files --error-unmatch apps/api/openapi.json
node apps/api/scripts/generate-openapi-spec.ts
# Keep the generated JSON's compact-array formatting stable; the file is
# intentionally excluded from the repo-wide Prettier pass.
pnpm exec prettier --ignore-path /dev/null --parser json --write apps/api/openapi.json
git diff --exit-code -- apps/api/openapi.json
