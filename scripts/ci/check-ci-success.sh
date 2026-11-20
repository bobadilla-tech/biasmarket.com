#!/usr/bin/env bash

set -euo pipefail

: "${DETECT_RESULT:?DETECT_RESULT is required}"
: "${E2E_RESULT:?E2E_RESULT is required}"
: "${API_E2E_CHANGED:?API_E2E_CHANGED is required}"
: "${EVENT_NAME:?EVENT_NAME is required}"
: "${RUN_E2E:?RUN_E2E is required}"
: "${HYGIENE_RESULT:?HYGIENE_RESULT is required}"
: "${BACKUP_RESTORE_RESULT:?BACKUP_RESTORE_RESULT is required}"
: "${BACKUP_RESTORE_CHANGED:?BACKUP_RESTORE_CHANGED is required}"
: "${RUN_BACKUP_RESTORE:?RUN_BACKUP_RESTORE is required}"

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

package_names=(API Web Mobile Workers DB i18n Queue Types "Design Tokens" Utils Validation Query Sanity "Web E2E (a11y)")
package_keys=(API WEB MOBILE WORKERS DB I18N QUEUE TYPES DESIGN_TOKENS UTILS VALIDATION QUERY SANITY WEB_E2E)
for index in "${!package_names[@]}"; do
  changed_var="${package_keys[$index]}_CHANGED"
  result_var="${package_keys[$index]}_RESULT"
  check_package "${package_names[$index]}" "${!changed_var:?$changed_var is required}" "${!result_var:?$result_var is required}"
done

# Hygiene has no path filter: it runs on every event and must always pass.
if [[ "$HYGIENE_RESULT" != "success" ]]; then
  echo "Hygiene must succeed; got $HYGIENE_RESULT"
  exit 1
fi

expected_e2e="skipped"
if [[ "$API_E2E_CHANGED" != "true" && "$API_E2E_CHANGED" != "false" ]]; then
  echo "API E2E changed output is invalid: $API_E2E_CHANGED"
  exit 1
fi

if [[ "$EVENT_NAME" == "push" ]]; then
  expected_e2e="success"
elif [[ "$EVENT_NAME" == "pull_request" && "$API_E2E_CHANGED" == "true" ]]; then
  expected_e2e="success"
elif [[ "$EVENT_NAME" == "workflow_dispatch" && "$RUN_E2E" == "true" ]]; then
  expected_e2e="success"
fi

if [[ "$E2E_RESULT" != "$expected_e2e" ]]; then
  echo "E2E result is $E2E_RESULT; expected $expected_e2e for $EVENT_NAME (api_e2e_changed=$API_E2E_CHANGED, run_e2e=$RUN_E2E)"
  exit 1
fi

if [[ "$BACKUP_RESTORE_CHANGED" != "true" && "$BACKUP_RESTORE_CHANGED" != "false" ]]; then
  echo "Backup restore changed output is invalid: $BACKUP_RESTORE_CHANGED"
  exit 1
fi

expected_backup_restore="skipped"
if [[ "$EVENT_NAME" == "push" ]]; then
  expected_backup_restore="success"
elif [[ "$EVENT_NAME" == "pull_request" && "$BACKUP_RESTORE_CHANGED" == "true" ]]; then
  expected_backup_restore="success"
elif [[ "$EVENT_NAME" == "workflow_dispatch" && "$RUN_BACKUP_RESTORE" == "true" ]]; then
  expected_backup_restore="success"
fi

if [[ "$BACKUP_RESTORE_RESULT" != "$expected_backup_restore" ]]; then
  echo "Backup restore result is $BACKUP_RESTORE_RESULT; expected $expected_backup_restore for $EVENT_NAME (backup_restore_changed=$BACKUP_RESTORE_CHANGED, run_backup_restore=$RUN_BACKUP_RESTORE)"
  exit 1
fi

echo "All required checks passed; E2E result: $E2E_RESULT; backup restore result: $BACKUP_RESTORE_RESULT"
