#!/usr/bin/env bash
# Writes infra/vps/caddy/active/{api,web}.caddy (temp file + atomic `mv`,
# same directory so the rename is same-filesystem) and reloads Caddy via its
# native config-reload API — no restart, no port rebind, in-flight requests
# complete against their original upstream (confirmed against real Caddy 2
# semantics).

_caddy_block() {
  local service_prefix="$1" port="$2" primary="$3" secondary="${4:-}" secondary_weight="${5:-}"
  if [[ -n "$secondary" ]]; then
    cat <<EOF
reverse_proxy ${service_prefix}-${primary}:${port} ${service_prefix}-${secondary}:${port} {
	lb_policy weighted_round_robin $((10 - secondary_weight)) ${secondary_weight}
	health_uri /api/health
	health_interval 10s
	health_timeout 5s
}
EOF
  else
    cat <<EOF
reverse_proxy ${service_prefix}-${primary}:${port} {
	health_uri /api/health
	health_interval 10s
	health_timeout 5s
}
EOF
  fi
}

# write_active_config COLOR — 100% of traffic to COLOR, steady state.
write_active_config() {
  local color="$1"
  local tmp_api tmp_web
  tmp_api="$(mktemp "$CADDY_ACTIVE_DIR/api.caddy.XXXXXX")"
  tmp_web="$(mktemp "$CADDY_ACTIVE_DIR/web.caddy.XXXXXX")"
  _caddy_block api 3000 "$color" >"$tmp_api"
  _caddy_block web 3001 "$color" >"$tmp_web"
  mv -f "$tmp_api" "$CADDY_ACTIVE_DIR/api.caddy"
  mv -f "$tmp_web" "$CADDY_ACTIVE_DIR/web.caddy"
}

# write_canary_config PRIMARY CANDIDATE WEIGHT — PRIMARY keeps (10-WEIGHT)
# parts of traffic, CANDIDATE gets WEIGHT parts (e.g. weight=1 -> 90/10).
write_canary_config() {
  local primary="$1" candidate="$2" weight="$3"
  local tmp_api tmp_web
  tmp_api="$(mktemp "$CADDY_ACTIVE_DIR/api.caddy.XXXXXX")"
  tmp_web="$(mktemp "$CADDY_ACTIVE_DIR/web.caddy.XXXXXX")"
  _caddy_block api 3000 "$primary" "$candidate" "$weight" >"$tmp_api"
  _caddy_block web 3001 "$primary" "$candidate" "$weight" >"$tmp_web"
  mv -f "$tmp_api" "$CADDY_ACTIVE_DIR/api.caddy"
  mv -f "$tmp_web" "$CADDY_ACTIVE_DIR/web.caddy"
}

# active_config_color FILE — best-effort parse of which color a currently
# written active/*.caddy is steady-state pointed at (used only by the
# startup reconciliation check — a canary-shaped file at startup already
# means a prior run crashed mid-switch and should also fail reconciliation).
# Echoes "" (unparseable) when the file names BOTH colors, i.e. a weighted
# canary — a crash mid-canary must NOT reconcile as if one color is live.
active_config_color() {
  local file="$1"
  [[ -f "$file" ]] || { echo ""; return; }
  local colors
  mapfile -t colors < <(grep -oE '[a-z]+-(blue|green):[0-9]+' "$file" | grep -oE '(blue|green)')
  [[ ${#colors[@]} -eq 1 ]] && echo "${colors[0]}" || echo ""
}

reload_caddy() {
  compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
}
