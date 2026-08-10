#!/usr/bin/env bash
# Polls Docker's own HEALTHCHECK status (not a hand-rolled HTTP probe) for
# every service passed in, bounded by a single overall timeout covering the
# whole phase's failure modes (container fails to start at all, healthcheck
# never turns healthy, image doesn't exist), not just the poll loop itself.

# wait_for_healthy TIMEOUT_SECONDS SERVICE... — returns 0 once every SERVICE
# reports Docker health "healthy", nonzero if TIMEOUT_SECONDS elapses first
# or any container exits/is missing.
wait_for_healthy() {
  local timeout="$1"
  shift
  local services=("$@")
  local start
  start="$(date +%s)"

  while true; do
    local all_healthy=true
    for svc in "${services[@]}"; do
      local cid
      cid="$(compose_running_container "$svc")"
      if [[ -z "$cid" ]]; then
        log_warn "wait_for_healthy: $svc has no running container yet"
        all_healthy=false
        continue
      fi
      local status
      status="$(docker inspect --format='{{.State.Health.Status}}' "$cid" 2>/dev/null || echo "unknown")"
      if [[ "$status" == "unhealthy" ]]; then
        log_error "wait_for_healthy: $svc reported unhealthy"
        return 1
      fi
      [[ "$status" == "healthy" ]] || all_healthy=false
    done

    $all_healthy && return 0

    local now
    now="$(date +%s)"
    if (( now - start >= timeout )); then
      log_error "wait_for_healthy: timed out after ${timeout}s waiting for: ${services[*]}"
      return 1
    fi
    sleep 3
  done
}
