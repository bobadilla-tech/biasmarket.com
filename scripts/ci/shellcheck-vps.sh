#!/usr/bin/env bash
# Local equivalent of the Hygiene job step "Shellcheck VPS scripts".
# Run from the repo root: pnpm check:vps-shell
# Bash 3.2 compatible: macOS /bin/bash does not have mapfile.
set -euo pipefail

if ! command -v shellcheck >/dev/null 2>&1; then
  echo "shellcheck is not installed. Install it, then re-run pnpm check:vps-shell." >&2
  exit 127
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root/infra/vps"

# Same invocation as .github/workflows/ci.yml (Hygiene: Shellcheck VPS scripts).
find . -type f -name '*.sh' -print0 | xargs -0 shellcheck -x
