#!/usr/bin/env bash
# flock -w 300 with owner metadata (PID/phase/timestamp/actor) instead of an
# indefinite wait with no operator-visible signal — someone SSHed in during
# a stuck deploy can `cat state/deploy.lock.meta` and see who/what is
# holding the lock and since when, rather than guessing.

# Single source of truth for the deploy-lock file descriptor number. Every
# OTHER reference to this fd (flock's own argv here, and
# lib/cleanup_schedule.sh's `exec ...>&-` close of the inherited copy)
# reads this variable rather than repeating the literal — except the `exec
# 9>` open immediately below, which bash's redirection grammar requires to
# be a literal digit sequence directly before `>`; a shell redirection
# target fd cannot be parameterized by a plain variable the way a normal
# command argument (like flock's) can. If this number ever changes, that
# one `exec 9>` line must be updated by hand to match.
DEPLOY_LOCK_FD=9

acquire_deploy_lock() {
  local actor="${1:-unknown}"
  exec 9>"$LOCK_FILE"
  if ! flock -w 300 "$DEPLOY_LOCK_FD"; then
    log_error "Could not acquire deploy lock within 300s. Current holder:"
    cat "$LOCK_META_FILE" >&2 2>/dev/null || log_error "  (no lock metadata file present)"
    exit 1
  fi
  atomic_write "$LOCK_META_FILE" "$(cat <<EOF
pid=$$
actor=$actor
phase=starting
acquired_at=$(date -u +%FT%TZ)
EOF
)"
}

# update_lock_phase PHASE — called at the top of every deploy.sh phase so
# `deploy.lock.meta` always reflects where an in-progress (or stuck) deploy
# actually is.
update_lock_phase() {
  local phase="$1"
  [[ -f "$LOCK_META_FILE" ]] || return 0
  local tmp
  tmp=$(mktemp)
  sed "s/^phase=.*/phase=$phase/" "$LOCK_META_FILE" >"$tmp"
  mv -f "$tmp" "$LOCK_META_FILE"
}

# Lock is released automatically when fd 9 closes at process exit; the meta
# file is intentionally left behind (not deleted) as a record of the last
# lock holder — releases/history.log is the authoritative audit trail, this
# is just a cheap "who had it last" breadcrumb for operators.
