#!/usr/bin/env bash

set -euo pipefail

: "${DETECT_RESULT:?DETECT_RESULT is required}"
: "${E2E_RESULT:?E2E_RESULT is required}"
: "${EVENT_NAME:?EVENT_NAME is required}"
: "${RUN_E2E:?RUN_E2E is required}"

if [[ "$DETECT_RESULT" != "success" ]]; then
  echo "Detect Changed Packages must succeed; got $DETECT_RESULT"
  exit 1
fi

check_package() {
  local name="$1"
  local changed="$2"
  local result="$3"

  if [[ "$changed" != "true" && "$changed" != "false" ]]; then
    echo "$name changed output is invalid: $changed"
    exit 1
  fi
  if [[ "$changed" == "true" && "$result" != "success" ]]; then
    echo "$name changed, but its job result is $result (expected success)"
    exit 1
  fi
  if [[ "$changed" == "false" && "$result" != "skipped" ]]; then
    echo "$name unchanged, but its job result is $result (expected skipped)"
    exit 1
  fi
}

package_names=(API Web Workers DB i18n Queue Types "Design Tokens" Utils Validation "Web E2E (a11y)")
package_keys=(API WEB WORKERS DB I18N QUEUE TYPES DESIGN_TOKENS UTILS VALIDATION WEB_E2E)
for index in "${!package_names[@]}"; do
  changed_var="${package_keys[$index]}_CHANGED"
  result_var="${package_keys[$index]}_RESULT"
  check_package "${package_names[$index]}" "${!changed_var:?$changed_var is required}" "${!result_var:?$result_var is required}"
done

expected_e2e="skipped"
if [[ "$EVENT_NAME" == "push" ]]; then
  expected_e2e="success"
elif [[ "$EVENT_NAME" == "workflow_dispatch" && "$RUN_E2E" == "true" ]]; then
  expected_e2e="success"
fi

if [[ "$E2E_RESULT" != "$expected_e2e" ]]; then
  echo "E2E result is $E2E_RESULT; expected $expected_e2e for $EVENT_NAME (run_e2e=$RUN_E2E)"
  exit 1
fi

echo "All required checks passed; E2E result: $E2E_RESULT"
