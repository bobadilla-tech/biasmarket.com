#!/usr/bin/env bash

set -euo pipefail

test -s apps/api/openapi.json
git ls-files --error-unmatch apps/api/openapi.json

generated_spec=$(mktemp)
generated_canonical=$(mktemp)
tracked_canonical=$(mktemp)
trap 'rm -f "$generated_spec" "$generated_canonical" "$tracked_canonical"' EXIT

OPENAPI_OUTPUT_PATH="$generated_spec" node apps/api/scripts/generate-openapi-spec.ts

# Compare JSON structure rather than object insertion order. Nest can discover
# routes in different orders, which changes paths and schema key order without
# changing the OpenAPI contract.
node --input-type=module - \
  "$generated_spec" apps/api/openapi.json "$generated_canonical" "$tracked_canonical" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';

const [generatedPath, trackedPath, generatedOutput, trackedOutput] = process.argv.slice(2);
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
};

const generated = canonicalize(
  JSON.parse(readFileSync(generatedPath, 'utf8')),
);
const tracked = canonicalize(JSON.parse(readFileSync(trackedPath, 'utf8')));
writeFileSync(generatedOutput, JSON.stringify(generated, null, 2) + '\n');
writeFileSync(trackedOutput, JSON.stringify(tracked, null, 2) + '\n');
NODE

# Prettier intentionally skips the tracked OpenAPI JSON, whose compact arrays
# are preserved by the generator. Compare the canonicalized JSON output.
if ! cmp -s "$generated_canonical" "$tracked_canonical"; then
  echo "Generated OpenAPI contract differs from apps/api/openapi.json" >&2
  diff -u "$tracked_canonical" "$generated_canonical" || true
  exit 1
fi
