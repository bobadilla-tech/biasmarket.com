#!/usr/bin/env bash
# Installs a pinned actionlint into the directory given as $1 (default: ./.actionlint-bin).
# The release tarball is verified against a committed sha256; nothing is piped
# into a shell. To upgrade: bump VERSION, download the linux_amd64 tarball
# yourself, compare with the release's checksums.txt, and commit the hash.
set -euo pipefail

VERSION="1.7.12"
SHA256="8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8"
DEST="${1:-.actionlint-bin}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
tarball="$tmp/actionlint.tar.gz"

curl --proto '=https' --tlsv1.2 -fsSL -o "$tarball" \
  "https://github.com/rhysd/actionlint/releases/download/v${VERSION}/actionlint_${VERSION}_linux_amd64.tar.gz"
echo "${SHA256}  ${tarball}" | sha256sum --check --status

mkdir -p "$DEST"
tar -xzf "$tarball" -C "$DEST" actionlint
echo "Installed actionlint ${VERSION} to ${DEST}/actionlint"
