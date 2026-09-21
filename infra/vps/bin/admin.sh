#!/usr/bin/env bash
# Operator CLI for the running production stack.
#
#   /opt/biasmarket/bin/admin.sh create  <email> [name]   new admin account (prints the password once)
#   /opt/biasmarket/bin/admin.sh promote <email>          give an existing account the admin role
#   /opt/biasmarket/bin/admin.sh revoke  <email>          set an account's role back to seller
#
# There is no source checkout on the VPS: the API's own scripts (apps/api/scripts)
# ship inside the API image, so this runs them inside the LIVE color's api
# container. It resolves the live color and image tag from state/ for you, which
# is what docs/core/admin-access.md describes doing by hand. Synced to the VPS by
# cd.yml along with the rest of infra/vps/ (see docs/core/deploy.md).
#
# Run it as root or the `deploy` user, from anywhere.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  sed -n '2,7p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

[[ $# -ge 2 ]] || usage
action="$1"
shift
email="$1"

# Reject anything that is not a plain email before it goes near a shell or SQL.
[[ "$email" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || {
  echo "Not a valid email address: $email" >&2
  exit 2
}

color="$(cat state/current_color 2>/dev/null || true)"
tag="$(cat state/current_sha 2>/dev/null || true)"
[[ -n "$color" && -n "$tag" ]] || {
  echo "state/current_color or state/current_sha is empty: this VPS has not been bootstrapped." >&2
  exit 1
}

# docker-compose.yml requires IMAGE_TAG for every service, even to `exec`.
dc() { IMAGE_TAG="$tag" docker compose --env-file env/shared.env "$@"; }

# No `--` before the arguments below: pnpm passes it through to the script, which
# reads process.argv[2] as the email, so `admin:create -- a@b.c` would create an
# admin whose email is literally `--`. See docs/core/admin-access.md.
case "$action" in
  create)
    dc exec -T "api-$color" pnpm --filter api run admin:create "$@"
    ;;
  promote)
    dc exec -T "api-$color" pnpm --filter api run admin:promote "$email"
    ;;
  revoke)
    # The SQL is fed on stdin so psql binds :'email' as a quoted literal, never
    # by string-pasting the address into the statement.
    printf '%s\n' "update \"user\" set role = 'seller' where email = :'email' returning email, role;" |
      # shellcheck disable=SC2016  # $POSTGRES_* / $1 must expand inside the container
      dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v email="$1"' _ "$email"
    ;;
  *)
    usage
    ;;
esac
