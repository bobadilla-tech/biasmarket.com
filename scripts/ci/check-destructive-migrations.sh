#!/usr/bin/env bash

set -euo pipefail

: "${BASE_SHA:?BASE_SHA must contain the pull request base SHA}"
: "${HEAD_SHA:?HEAD_SHA must contain the pull request head SHA}"
: "${GITHUB_STEP_SUMMARY:=/dev/null}"

new_migrations=()
while IFS= read -r migration; do
  [[ -n "$migration" ]] && new_migrations+=("$migration")
done < <(
  git diff --name-only --diff-filter=A \
    "$BASE_SHA" \
    "$HEAD_SHA" \
    -- 'packages/db/prisma/migrations/*/migration.sql'
)

if [[ ${#new_migrations[@]} -eq 0 ]]; then
  echo "No new migration files in this PR."
  exit 0
fi

destructive_pattern='DROP[[:space:]]+TABLE|DROP[[:space:]]+COLUMN|DROP[[:space:]]+TYPE|ALTER[[:space:]]+COLUMN[^;]*TYPE'
found=()
for migration in "${new_migrations[@]}"; do
  grep -qiE "$destructive_pattern" "$migration" && found+=("$migration")
done

if [[ ${#found[@]} -eq 0 ]]; then
  echo "No destructive migrations detected."
  exit 0
fi

{
  echo "## :warning: Destructive migration(s) in this PR"
  echo
  echo "These new migrations contain DROP TABLE / DROP COLUMN / DROP TYPE / ALTER COLUMN...TYPE:"
  echo
  for migration in "${found[@]}"; do echo "- \`$migration\`"; done
  echo
  echo "\`deploy.sh\`'s destructive-migration gate will refuse to apply these in CD — merging is fine, but deploying needs a manual run with \`--i-understand-this-is-destructive\` (see docs/core/blue-green-migrations.md's expand/contract checklist). Plan for that before this lands on main, or split into an expand/contract pair instead."
} >> "$GITHUB_STEP_SUMMARY"

echo "::error::Destructive migration(s) detected — CD will refuse to auto-deploy this PR once merged. See the job summary."
exit 1
