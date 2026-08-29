#!/usr/bin/env bash

set -euo pipefail

readonly ROOT="${GITHUB_WORKSPACE:-$(pwd)}"
readonly ENV_FILE="$ROOT/scripts/ci/e2e.env.example"

: "${GITHUB_ENV:?GITHUB_ENV must be set by GitHub Actions}"

grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE" >> "$GITHUB_ENV"
