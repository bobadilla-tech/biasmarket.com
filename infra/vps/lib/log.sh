#!/usr/bin/env bash
# Secret-safe logging. NEVER `set -x` in any script that sources this near a
# command embedding a secret (e.g. -e DATABASE_URL=...) — GitHub Actions logs
# for this public repo are publicly viewable by default, and VPS-only
# secrets get zero automatic masking since they're never in GitHub's
# `secrets.` context. Every log line here goes to stderr so stdout stays
# clean for functions that intentionally return a value via command
# substitution.

log_info() { printf '[%s] INFO  %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
log_warn() { printf '[%s] WARN  %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
log_error() { printf '[%s] ERROR %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }

# die MESSAGE — log and exit 1. Never pass a secret value as MESSAGE.
die() {
  log_error "$*"
  exit 1
}
