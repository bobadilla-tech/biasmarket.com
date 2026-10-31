#!/usr/bin/env bash

# Decide whether a GitHub Release needs mobile builds.
#
# PR/push CI answers "did this diff touch mobile?" with dorny/paths-filter in
# ci.yml. A release has no PR to diff, and comparing against the previous
# *release* would silently drop mobile changes whenever an intermediate release
# skipped (or failed) its mobile build. So instead we diff against the newest
# earlier release that already carries BOTH mobile artifacts. Failed or skipped
# builds leave no assets, so the baseline stays put and the next release picks
# the changes up. Re-running a release is idempotent: its baseline never moves.
#
# The path list is read from the `mobile` filter in ci.yml at the release tag
# (via `git show`, so a re-dispatch of an older tag still runs these scripts),
# so CI and releases cannot drift apart.
#
# Env: GH_TOKEN, GITHUB_REPOSITORY, TAG (required); FORCE=true skips the diff.
# Writes `build`, `base`, `reason` to $GITHUB_OUTPUT (stdout if unset).

set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${TAG:?TAG is required}"

readonly CI_WORKFLOW=".github/workflows/ci.yml"
readonly OUT="${GITHUB_OUTPUT:-/dev/stdout}"

emit() {
  {
    echo "build=$1"
    echo "base=$2"
    echo "reason=$3"
  } >>"$OUT"
  echo "mobile build=$1 base='$2': $3"
}

if [[ "${FORCE:-false}" == "true" ]]; then
  emit true "" "forced via workflow_dispatch"
  exit 0
fi

published_at="$(gh api "repos/$GITHUB_REPOSITORY/releases/tags/$TAG" --jq .published_at)"

base="$(
  gh api --paginate "repos/$GITHUB_REPOSITORY/releases" --jq '.[]' |
    jq -rs --arg tag "$TAG" --arg at "$published_at" '
      [ .[]
        | select(.draft | not)
        | select(.tag_name != $tag and .published_at < $at)
        | select([.assets[].name]
            | (any(startswith("mobile-android-")) and any(startswith("mobile-ios-"))))
      ]
      | sort_by(.published_at) | reverse | .[0].tag_name // empty'
)"

if [[ -z "$base" ]]; then
  emit true "" "no earlier release has mobile artifacts; building the first one"
  exit 0
fi

mapfile -t patterns < <(
  git show "refs/tags/$TAG:$CI_WORKFLOW" |
    yq -r '.jobs."detect-changes".steps[] | select(.id == "filter") | .with.filters' |
    yq -r '.mobile[]'
)
if [[ ${#patterns[@]} -eq 0 ]]; then
  echo "Could not read the mobile filter from $CI_WORKFLOW at $TAG" >&2
  exit 1
fi

pathspecs=()
for p in "${patterns[@]}"; do
  pathspecs+=(":(glob)$p")
done

changed="$(git diff --name-only "refs/tags/$base" "refs/tags/$TAG" -- "${pathspecs[@]}")"

if [[ -n "$changed" ]]; then
  echo "Mobile-related files changed since $base:"
  echo "$changed" | head -20
  emit true "$base" "mobile-related files changed since $base"
else
  emit false "$base" "no mobile-related changes since $base"
fi
