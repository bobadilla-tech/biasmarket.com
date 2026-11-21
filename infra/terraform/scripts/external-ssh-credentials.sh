#!/usr/bin/env bash
# Create local deploy keypairs or upload them to the GitHub production
# environment without passing private-key contents on a command line.
set -euo pipefail
umask 077

GH_REPO="bobadilla-tech/biasmarket.com"
SSH_DIR="${BIASMARKET_SSH_DIR:-$HOME/.ssh/biasmarket-production}"
RSYNC_KEY="$SSH_DIR/deploy-rsync"
DISPATCH_KEY="$SSH_DIR/deploy-dispatch"

usage() {
  cat <<'EOF'
Usage:
  external-ssh-credentials.sh generate
  external-ssh-credentials.sh upload

generate creates the local Ed25519 deploy keypairs and prints only their
public halves for the external-mode Terraform variables.

upload sends the private keys and host details directly to the GitHub
production environment. First verify the host public key through the
Contabo provider console. The private-key values are read from files and
never printed or placed in command-line arguments.
EOF
}

validate_existing_pair() {
  local private_key="$1" public_key="$2" derived
  [[ -s "$private_key" && -s "$public_key" ]] || {
    printf 'Missing keypair: %s\n' "$private_key" >&2
    return 1
  }
  derived="$(ssh-keygen -y -f "$private_key")"
  [[ "$derived" == "$(cat "$public_key")" ]] || {
    printf 'Private/public key mismatch: %s\n' "$private_key" >&2
    return 1
  }
}

generate() {
  mkdir -p "$SSH_DIR"
  chmod 700 "$SSH_DIR"
  if [[ -e "$RSYNC_KEY" || -e "$RSYNC_KEY.pub" || -e "$DISPATCH_KEY" || -e "$DISPATCH_KEY.pub" ]]; then
    printf 'Key files already exist under %s; refusing to overwrite them.\n' "$SSH_DIR" >&2
    return 1
  fi

  ssh-keygen -q -t ed25519 -N '' -C biasmarket-deploy-rsync -f "$RSYNC_KEY"
  ssh-keygen -q -t ed25519 -N '' -C biasmarket-deploy-dispatch -f "$DISPATCH_KEY"
  chmod 600 "$RSYNC_KEY" "$DISPATCH_KEY"
  chmod 644 "$RSYNC_KEY.pub" "$DISPATCH_KEY.pub"
  printf 'Copy these public keys into deploy_rsync_public_key and deploy_dispatch_public_key in terraform.tfvars:\n'
  cat "$RSYNC_KEY.pub" "$DISPATCH_KEY.pub"
  printf '\nPrivate keys remain in %s and were not printed.\n' "$SSH_DIR"
}

upload() {
  command -v gh >/dev/null || { printf 'GitHub CLI (gh) is required.\n' >&2; return 1; }
  validate_existing_pair "$RSYNC_KEY" "$RSYNC_KEY.pub"
  validate_existing_pair "$DISPATCH_KEY" "$DISPATCH_KEY.pub"
  gh auth status --hostname github.com >/dev/null

  local host_ipv4 host_public_key known_hosts
  read -r -p 'New VPS IPv4 address: ' host_ipv4
  [[ "$host_ipv4" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || {
    printf 'Enter the VPS IPv4 address.\n' >&2
    return 1
  }
  read -r -p 'Verified ssh-ed25519 host public-key line from the Contabo console: ' host_public_key
  [[ "$host_public_key" =~ ^ssh-ed25519[[:space:]][A-Za-z0-9+/]+=*([[:space:]].*)?$ ]] || {
    printf 'Expected an ssh-ed25519 public-key line.\n' >&2
    return 1
  }
  known_hosts="$host_ipv4 $host_public_key"

  gh secret set DEPLOY_SSH_HOST --repo "$GH_REPO" --env production <<<"$host_ipv4"
  gh secret set DEPLOY_SSH_USER --repo "$GH_REPO" --env production <<<"deploy"
  gh secret set DEPLOY_SSH_KNOWN_HOSTS --repo "$GH_REPO" --env production <<<"$known_hosts"
  gh secret set DEPLOY_SSH_KEY_RSYNC --repo "$GH_REPO" --env production <"$RSYNC_KEY"
  gh secret set DEPLOY_SSH_KEY_DISPATCH --repo "$GH_REPO" --env production <"$DISPATCH_KEY"
  printf 'Updated the five DEPLOY_SSH_* secrets in the GitHub production environment.\n'
}

case "${1:-}" in
  generate) generate ;;
  upload) upload ;;
  *) usage >&2; exit 2 ;;
esac
