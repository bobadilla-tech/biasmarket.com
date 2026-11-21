#!/usr/bin/env bash
# Validate the runtime environment shape for a future scheduled backup.
# This does not contact Postgres, MinIO, the S3 destination, or Kuma, and it
# does not initialize a repository or enable a systemd timer.
set -euo pipefail

error() {
  printf 'backup config: %s\n' "$1" >&2
  return 1
}

validate() {
  local name value missing=()
  local -a required=(
    RESTIC_REPOSITORY
    RESTIC_PASSWORD
    AWS_ACCESS_KEY_ID
    AWS_SECRET_ACCESS_KEY
    KUMA_BACKUP_PUSH_URL
    BACKUP_SOURCE_ENDPOINT
    BACKUP_SOURCE_ACCESS_KEY
    BACKUP_SOURCE_SECRET_KEY
    S3_BUCKET
    S3_LOGO_BUCKET
    S3_PAYMENT_BUCKET
  )

  for name in "${required[@]}"; do
    value="${!name:-}"
    if [[ -z "$value" ]]; then
      missing+=("$name")
    fi
  done
  if ((${#missing[@]})); then
    error "missing required settings: ${missing[*]}"
    return 1
  fi

  if [[ ${#RESTIC_PASSWORD} -lt 32 ]]; then
    error "RESTIC_PASSWORD must be at least 32 characters"
    return 1
  fi

  local repository_path="${RESTIC_REPOSITORY#s3:https://}"
  if [[ "$repository_path" == "$RESTIC_REPOSITORY" || "$repository_path" != */* || "${repository_path%%/*}" == "" || "${repository_path#*/}" == "" ]]; then
    error "RESTIC_REPOSITORY must use s3:https://host/bucket[/prefix]"
    return 1
  fi

  if [[ "$BACKUP_SOURCE_ENDPOINT" != http://* && "$BACKUP_SOURCE_ENDPOINT" != https://* ]]; then
    error "BACKUP_SOURCE_ENDPOINT must be an http(s) URL"
    return 1
  fi

  if [[ "$KUMA_BACKUP_PUSH_URL" != https://* || "$KUMA_BACKUP_PUSH_URL" != */api/push/* ]]; then
    error "KUMA_BACKUP_PUSH_URL must be an HTTPS Kuma push URL"
    return 1
  fi

  if [[ "$S3_BUCKET" == "$S3_LOGO_BUCKET" || "$S3_BUCKET" == "$S3_PAYMENT_BUCKET" || "$S3_LOGO_BUCKET" == "$S3_PAYMENT_BUCKET" ]]; then
    error "the three MinIO bucket names must be distinct"
    return 1
  fi

  printf 'Backup environment shape is valid. No connection or backup was attempted.\n'
}

self_test() {
  local -a fake_env=(
    RESTIC_REPOSITORY=s3:https://objects.example.test/backups/biasmarket
    RESTIC_PASSWORD=local-test-only-not-a-production-secret-123456
    AWS_ACCESS_KEY_ID=local-test-access-key
    AWS_SECRET_ACCESS_KEY=local-test-secret-key
    KUMA_BACKUP_PUSH_URL=https://status.example.test/api/push/local-test-token
    BACKUP_SOURCE_ENDPOINT=http://minio:9000
    BACKUP_SOURCE_ACCESS_KEY=local-minio-access-key
    BACKUP_SOURCE_SECRET_KEY=local-minio-secret-key
    AWS_DEFAULT_REGION=us-east-1
    S3_BUCKET=products
    S3_LOGO_BUCKET=logos
    S3_PAYMENT_BUCKET=payments
  )

  env -i PATH="$PATH" "${fake_env[@]}" bash "$0" --check >/dev/null

  if env -i PATH="$PATH" bash "$0" --check >/dev/null 2>&1; then
    error "self-test accepted an empty environment"
    return 1
  fi

  local -a insecure_env=("${fake_env[@]}")
  insecure_env[0]=RESTIC_REPOSITORY=s3:http://objects.example.test/backups/biasmarket
  if env -i PATH="$PATH" "${insecure_env[@]}" bash "$0" --check >/dev/null 2>&1; then
    error "self-test accepted a non-TLS destination"
    return 1
  fi

  local -a duplicate_bucket_env=("${fake_env[@]}")
  duplicate_bucket_env[10]=S3_LOGO_BUCKET=products
  if env -i PATH="$PATH" "${duplicate_bucket_env[@]}" bash "$0" --check >/dev/null 2>&1; then
    error "self-test accepted duplicate source buckets"
    return 1
  fi

  printf 'Backup config self-test passed. Fake credentials were used; no network access occurred.\n'
}

case "${1:---check}" in
  --check) validate ;;
  --self-test) self_test ;;
  *) error "usage: $0 [--check|--self-test]" ;;
esac
