#!/usr/bin/env bash
# The migration phase: pre-migration pg_dump snapshot, a short lock_timeout
# on the migration runner's own DB session, a static destructive-migration
# gate, advisory-lock-failure handled as its own retryable error class, and
# the migration_pending marker the systemd timer (T9) watches for its
# stuck-deploy alert. Run once, against the candidate's new image, BEFORE
# the candidate's long-running containers start — see
# docs/core/blue-green-migrations.md.

DESTRUCTIVE_PATTERN='DROP[[:space:]]+TABLE|DROP[[:space:]]+COLUMN|DROP[[:space:]]+TYPE|ALTER[[:space:]]+COLUMN[^;]*TYPE'

migration_database_url_with_lock_timeout() {
  # Reads DATABASE_URL directly out of env/shared.env — never echoed, never
  # logged. Appends a short lock_timeout so a conflicting lock held by live
  # traffic fails THIS migration fast and loud instead of silently queuing
  # (Postgres lock queues are FIFO per relation) and then blocking the live
  # color's own subsequent queries against that table.
  local base
  base="$(grep -m1 '^DATABASE_URL=' "$ENV_DIR/shared.env" | cut -d= -f2-)"
  [[ -n "$base" ]] || die "DATABASE_URL not found in env/shared.env"
  if [[ "$base" == *'?'* ]]; then
    printf '%s&options=-c%%20lock_timeout%%3D5000ms' "$base"
  else
    printf '%s?options=-c%%20lock_timeout%%3D5000ms' "$base"
  fi
}

migration_pre_snapshot() {
  local sha="$1"
  local outfile="$RELEASES_DIR/pre-migrate-${sha}-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  log_info "Taking pre-migration snapshot -> $(basename "$outfile")"
  # Runs against the always-on `db` service directly (not a candidate
  # container) — reads POSTGRES_USER/POSTGRES_DB from its own env_file.
  # SC2016: $POSTGRES_USER/$POSTGRES_DB are expanded by the container's own
  # `sh -c`, not by this shell — deliberately kept single-quoted.
  # shellcheck disable=SC2016
  compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip >"$outfile"
  [[ -s "$outfile" ]] || die "Pre-migration snapshot came back empty — refusing to proceed with migration"
}

migration_prune_snapshots() {
  local keep_days="${SNAPSHOT_RETENTION_DAYS:-14}"
  find "$RELEASES_DIR" -maxdepth 1 -name 'pre-migrate-*.sql.gz' -mtime "+${keep_days}" -delete 2>/dev/null || true
}

# migration_pending_names COLOR — names of migrations not yet applied
# against the live DB, according to the candidate image's own Prisma
# schema/client (`prisma migrate status`, which exits nonzero when there are
# pending migrations — output captured regardless of exit code).
migration_pending_names() {
  local color="$1"
  local out
  out="$(compose run --rm --no-deps "api-${color}" pnpm --filter @biasmarket/db exec prisma migrate status 2>&1 || true)"
  echo "$out" | grep -oE '[0-9]{14}_[a-zA-Z0-9_]+' | sort -u
}

# migration_scan_destructive COLOR NAME... — echoes the subset of NAME that
# contain a DROP TABLE/DROP COLUMN/DROP TYPE/ALTER COLUMN...TYPE statement,
# read from the candidate image's own copy of
# packages/db/prisma/migrations/<name>/migration.sql (bundled into the
# runtime image, see api.Dockerfile).
migration_scan_destructive() {
  local color="$1"
  shift
  local name sql
  for name in "$@"; do
    sql="$(compose run --rm --no-deps --entrypoint sh "api-${color}" -c \
      "cat /app/packages/db/prisma/migrations/${name}/migration.sql 2>/dev/null" || true)"
    echo "$sql" | grep -qiE "$DESTRUCTIVE_PATTERN" && echo "$name"
  done
}

# run_migration_phase COLOR SHA ALLOW_DESTRUCTIVE
run_migration_phase() {
  local color="$1" sha="$2" allow_destructive="$3"

  update_lock_phase "migration"
  atomic_write "$MIGRATION_PENDING_FILE" "$(cat <<EOF
sha=$sha
color=$color
started_at=$(date -u +%FT%TZ)
EOF
)"

  local pending
  mapfile -t pending < <(migration_pending_names "$color")

  if [[ ${#pending[@]} -eq 0 ]]; then
    log_info "No pending migrations for color=$color."
    rm -f "$MIGRATION_PENDING_FILE"
    return 0
  fi

  log_info "Pending migrations: ${pending[*]}"

  local destructive
  mapfile -t destructive < <(migration_scan_destructive "$color" "${pending[@]}")

  if [[ ${#destructive[@]} -gt 0 && "$allow_destructive" != "true" ]]; then
    rm -f "$MIGRATION_PENDING_FILE"
    die "Destructive migration(s) detected (${destructive[*]}: DROP TABLE/DROP COLUMN/DROP TYPE/ALTER COLUMN...TYPE) — refusing without --i-understand-this-is-destructive. See docs/core/blue-green-migrations.md's expand/contract checklist before overriding."
  fi
  if [[ ${#destructive[@]} -gt 0 ]]; then
    log_warn "Proceeding with destructive migration(s) (${destructive[*]}) — --i-understand-this-is-destructive was passed."
  fi

  migration_pre_snapshot "$sha"

  log_info "Applying migrations against candidate image (color=$color) ..."
  local migrate_db_url mig_output mig_status
  migrate_db_url="$(migration_database_url_with_lock_timeout)"
  # NEVER `set -x` past this point — $migrate_db_url embeds the DB
  # password, and GHA/systemd-journal logs for this public repo have no
  # automatic secret masking for VPS-only values.
  mig_output="$(compose run --rm --no-deps -e DATABASE_URL="$migrate_db_url" "api-${color}" \
    pnpm --filter @biasmarket/db exec prisma migrate deploy 2>&1)"
  mig_status=$?

  if [[ $mig_status -ne 0 ]]; then
    rm -f "$MIGRATION_PENDING_FILE"
    if echo "$mig_output" | grep -qi "advisory lock"; then
      die "Migration failed: could not acquire Prisma's advisory lock (concurrent migrate deploy?) — this is retryable, re-run the deploy. Candidate torn down, previous color untouched."
    fi
    log_error "prisma migrate deploy output:"
    printf '%s\n' "$mig_output" >&2
    die "Migration failed — candidate torn down, previous color untouched. Check for a conflicting lock held by live traffic (lock_timeout fired) vs. bad migration SQL."
  fi

  migration_prune_snapshots
  rm -f "$MIGRATION_PENDING_FILE"
}
