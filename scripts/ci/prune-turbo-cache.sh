#!/usr/bin/env bash

# Drop turbo cache entries written more than 7 days ago before the job saves
# `.turbo/cache`. Each save restores the previous archive and adds to it, so
# without pruning the archive grows forever. A still-useful entry that gets
# pruned is simply rebuilt (and re-cached) on its next miss.

set -euo pipefail

readonly CACHE_DIR="${1:-.turbo/cache}"
readonly MAX_AGE_DAYS="${TURBO_CACHE_MAX_AGE_DAYS:-7}"

if [[ ! -d "$CACHE_DIR" ]]; then
  exit 0
fi

before="$(du -sh "$CACHE_DIR" | cut -f1)"
find "$CACHE_DIR" -type f -mtime "+$MAX_AGE_DAYS" -delete
after="$(du -sh "$CACHE_DIR" | cut -f1)"
echo "turbo cache: $before -> $after (pruned entries older than $MAX_AGE_DAYS days)"
