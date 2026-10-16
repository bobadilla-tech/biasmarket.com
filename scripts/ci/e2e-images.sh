#!/usr/bin/env bash

# Digest-pinned sidecar images shared by the API and web E2E jobs, plus a
# pull-through tarball cache with real retry/backoff.
#
# Why not `services:`? The runner pulls service images before any step runs,
# retries only three times with a few seconds of backoff, and offers no cache.
# A transient GHCR `toomanyrequests` then fails the whole job before a single
# test executes. Pulling here lets us (1) restore images from actions/cache, so
# most runs never contact the registry, and (2) back off for minutes, not
# seconds, when a pull is genuinely needed.
#
# Sourced by e2e-datastores.sh/minio-e2e.sh, or run directly as
# `bash scripts/ci/e2e-images.sh prefetch` to warm the cache in one step.
# The workflow's image cache key hashes this file, so bumping a digest below
# invalidates the cache automatically.

# Both minio-e2e.sh and e2e-datastores.sh source this file; load it once.
if [[ -n "${E2E_IMAGES_SOURCED:-}" ]]; then
  return 0
fi
E2E_IMAGES_SOURCED=1

# Digests resolved 2026-08-28. The immich Postgres image keeps the standard
# postgres entrypoint while avoiding Docker Hub; Valkey 7 speaks the Redis
# protocol used by the application; the MinIO image also supplies `mc`.
readonly E2E_POSTGRES_REF="ghcr.io/immich-app/postgres:18-vectorchord0.5.3-pgvector0.8.1@sha256:828081a755d3911a2d94f0a2be9f98570c07d52cf080fd310a9d6e4b83b73aa5"
readonly E2E_REDIS_REF="ghcr.io/valkey-io/valkey:7-alpine@sha256:8fc3da585dc963d91754d72da22d54671c6ec495d8a0257a6a9100a9a4658f38"
readonly E2E_MINIO_REF="ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z@sha256:69b55a1c1c5dc285ce04db96689f5b2102317fc77a50680a1874ca6efd1c87f9"

readonly E2E_IMAGE_CACHE_DIR="${E2E_IMAGE_CACHE_DIR:-$HOME/.cache/biasmarket-e2e-images}"

# Local tag for a pinned ref: `biasmarket-e2e/<repo>:<digest prefix>`.
# `docker save` of a bare digest ref drops the name on `docker load`, so every
# image is re-tagged locally after a verified-by-digest pull and run by that tag.
e2e_image_tag() {
  local ref="$1"
  local repo="${ref%%@*}"
  repo="${repo%:*}"
  repo="${repo##*/}"
  local digest="${ref##*@sha256:}"
  printf 'biasmarket-e2e/%s:%s\n' "$repo" "${digest:0:16}"
}

e2e_pull_with_backoff() {
  local ref="$1"
  local delays=(10 20 40 60 90)
  local attempt=0
  until docker pull --quiet "$ref"; do
    if (( attempt >= ${#delays[@]} )); then
      echo "::error::docker pull failed after $((attempt + 1)) attempts: $ref"
      return 1
    fi
    local delay=$(( delays[attempt] + RANDOM % 10 ))
    echo "::warning::docker pull failed (attempt $((attempt + 1))); retrying in ${delay}s: $ref"
    sleep "$delay"
    attempt=$((attempt + 1))
  done
}

# Ensure the pinned image is available locally under its local tag: already
# present → no-op; cached tarball → `docker load`; otherwise pull with backoff
# and write the tarball so actions/cache can persist it. Tarballs are stored
# uncompressed: actions/cache already zstd-compresses the cache archive.
e2e_ensure_image() {
  local ref="$1"
  local tag
  tag="$(e2e_image_tag "$ref")"
  local tarball="$E2E_IMAGE_CACHE_DIR/${tag//[\/:]/_}.tar"

  if ! docker image inspect "$tag" >/dev/null 2>&1 && [[ -f "$tarball" ]]; then
    echo "Loading $tag from image cache"
    if ! docker load --quiet --input "$tarball" >/dev/null ||
      ! docker image inspect "$tag" >/dev/null 2>&1; then
      echo "::warning::Cached tarball for $tag is unusable; pulling instead"
      rm -f "$tarball"
    fi
  fi

  if ! docker image inspect "$tag" >/dev/null 2>&1; then
    echo "Pulling $ref"
    e2e_pull_with_backoff "$ref"
    docker tag "$ref" "$tag"
  fi

  if [[ ! -f "$tarball" ]]; then
    mkdir -p "$E2E_IMAGE_CACHE_DIR"
    docker save --output "$tarball.tmp" "$tag"
    mv "$tarball.tmp" "$tarball"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -Eeuo pipefail
  case "${1:-}" in
    prefetch)
      for ref in "$E2E_POSTGRES_REF" "$E2E_REDIS_REF" "$E2E_MINIO_REF"; do
        e2e_ensure_image "$ref"
      done
      ;;
    *)
      echo "usage: $0 prefetch" >&2
      exit 2
      ;;
  esac
fi
