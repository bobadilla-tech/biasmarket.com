#!/usr/bin/env bash
# Smoke tests, both retried 3x with backoff before declaring failure — zero
# retry tolerance risks failing a whole deploy on a single transient blip.

# retry_3x DESCRIPTION CMD... — runs CMD (a function name + args), retrying
# up to 3 times with 5s/10s backoff. DESCRIPTION is only for log lines.
retry_3x() {
  local desc="$1"
  shift
  local attempt
  for attempt in 1 2 3; do
    if "$@"; then
      log_info "smoke test OK ($desc, attempt $attempt/3)"
      return 0
    fi
    log_warn "smoke test failed ($desc, attempt $attempt/3)"
    [[ $attempt -lt 3 ]] && sleep $((attempt * 5))
  done
  log_error "smoke test FAILED after 3 attempts ($desc)"
  return 1
}

# smoke_api_direct COLOR — direct-to-container: exec's into api-<color>'s
# own network namespace and hits the real public smoke-test target
# (GET /api/stores/directory — confirmed real, @Public(), hits Postgres, no
# seeded-data dependency, see stores.controller.ts) via loopback, bypassing
# Caddy entirely. This is what proves the candidate before it ever sees a
# byte of real traffic.
smoke_api_direct() {
  local color="$1"
  compose exec -T "api-${color}" node -e "
    require('http').get('http://127.0.0.1:3000/api/stores/directory', (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          process.exit(res.statusCode === 200 && parsed ? 0 : 1);
        } catch { process.exit(1); }
      });
    }).on('error', () => process.exit(1));
  "
}

smoke_web_direct() {
  local color="$1"
  compose exec -T "web-${color}" node -e "
    require('http').get('http://127.0.0.1:3001/api/health', (res) => {
      res.resume();
      process.exit(res.statusCode < 500 ? 0 : 1);
    }).on('error', () => process.exit(1));
  "
}

# smoke_public_domain — post-switch check against the real public domains
# (after a Caddy canary/full switch), run from the VPS itself over curl.
# Requires curl on the VPS host (see docs/core/blue-green-migrations.md
# provisioning notes).
smoke_public_domain() {
  local api_status web_status
  api_status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://api.biasmarket.com/api/stores/directory" || echo "000")"
  web_status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://biasmarket.com/api/health" || echo "000")"
  [[ "$api_status" == "200" && "$web_status" -lt 500 ]]
}
