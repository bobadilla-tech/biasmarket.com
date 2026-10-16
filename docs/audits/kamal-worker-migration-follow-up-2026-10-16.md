# Kamal migration: worker lifecycle follow-up

Date: 2026-10-16. Scope: repository inspection and current primary documentation; no VPS inspection, deployment, or container shutdown experiment. This supplements the [August audit](cd-kamal-evaluation-2026-08-29.md), rather than validating its estimates or production assumptions.

## Recommendation

Proceed toward replacing the custom deployment framework with a supported tool. Worker interruption is a migration acceptance criterion, not a reason to retain bespoke blue/green orchestration. Kamal supports job servers and configurable termination grace. It does not supply exactly-once job execution or application compatibility guarantees.

The August audit ultimately recommended trimming the existing framework first (§1 and §10), despite identifying Kamal as a reasonable fit. That recommendation conflicts with the present objective of transferring deployment lifecycle ownership to a maintained tool. There is no evidence here that a Kamal migration was attempted and failed.

## What can happen to a job during deployment?

| Situation | Expected behavior and limitation |
| --- | --- |
| Job waiting in Redis | Replacing a worker does not inherently delete it. It waits for a consumer, provided Redis data and queue configuration remain intact. |
| Active job finishes within termination grace | Graceful close stops taking new jobs and waits for active handlers. |
| Active job exceeds grace or worker crashes | Docker can kill it; BullMQ can recover it as stalled and execute it again. The handler restarts; arbitrary application progress is not resumed. |
| Side effect happened before the kill, completion was not acknowledged | Retrying can repeat the side effect, such as sending an email twice. |
| Repeated stalls or exhausted failure retries | Job can become failed; monitoring and a recovery procedure are still needed. Recovery is not an unconditional guarantee of eventual success. |

These behaviors follow BullMQ's [graceful shutdown](https://docs.bullmq.io/guide/workers/graceful-shutdown) and [stalled job](https://docs.bullmq.io/guide/jobs/stalled) documentation. Ordinary job failure retries and stalled-job limits are distinct mechanisms.

## Current implementation

- `apps/workers/src/main.ts:20` enables Nest shutdown hooks. `infra/docker/workers.Dockerfile:91` uses exec-form `node` as the container command, suitable for receiving termination signals. Nest's [BullExplorer implementation](https://github.com/nestjs/bull/blob/master/packages/bullmq/lib/bull.explorer.ts) closes registered workers on application shutdown. This wiring supports graceful shutdown; its behavior with the installed dependencies has not been exercised here.
- `infra/vps/deploy.sh:90` stops containers without an explicit timeout. The worker services in `infra/vps/docker-compose.yml:189` and `:215` declare no custom stop grace. A long handler can therefore outlive the container's grace today as well.
- `apps/workers/src/jobs/mailer/mailer.processor.ts:16` allows five concurrent mail jobs; its `process()` passes only payload data into the mail core. `apps/workers/src/jobs/mailer/mailer.core.ts:72` calls Resend without an idempotency key. A kill after provider acceptance can cause a duplicate send. A BullMQ job ID alone does not deduplicate an external provider effect.
- `apps/workers/src/health/health.controller.ts:3` explicitly implements liveness only. Worker Docker health checks live in Compose (`infra/vps/docker-compose.yml:201`), not a Dockerfile `HEALTHCHECK`. Porting only the image would discard those declarations. Queue connectivity/readiness needs deliberate validation.
- Expiration workers call internal API endpoints (`apps/workers/src/jobs/orders/expire-orders.processor.ts:21`; equivalent premium processor). Existing runtime examples bind those calls to color-specific DNS names (`infra/vps/env/blue.runtime.env.example:9`, `green.runtime.env.example:3`). Migration must replace that routing assumption and keep the required API reachable while old workers finish. Merely increasing worker grace cannot preserve an API dependency that has already stopped.

## Corrections to the August audit

1. **BullMQ close timeout:** §8 proposes matching an alleged BullMQ close timeout with Docker grace. Official documentation says `worker.close()` has no intrinsic timeout. The surrounding container termination deadline is what must be configured, alongside bounded application work. The comment in `apps/workers/src/main.ts:18` repeats this inaccurate timeout assumption.
2. **“Graceful drain already works”:** shutdown hooks are present, but source inspection is evidence of wiring, not proof of real container draining. Forced interruption and provider acknowledgement need runtime tests.
3. **“Seconds” of worker overlap:** Kamal starts the replacement, checks readiness, then stops the old version. Its [boot source](https://github.com/basecamp/kamal/blob/v2.12.0/lib/kamal/cli/app/boot.rb) supports that sequence. Overlap includes startup/readiness and old-job drain; it is not guaranteed to last only a few seconds.
4. **Health gating:** [Kamal configuration](https://kamal-deploy.org/docs/configuration/overview/) distinguishes Docker health checks from a readiness delay. Without a proxy or health check, the documented default delay is seven seconds. That is insufficient evidence that a worker can consume jobs.
5. **Three images are not three roles in one stock service:** the old audit's build parity claim (§6) understates the design work. Kamal documents a root `image` and role-specific commands/settings, not a role-specific image. This repository has separate API, web, and worker images. Use separate ordinary Kamal service configurations, or consciously consolidate an image; do not assume three roles automatically preserve the current build topology. [Configuration](https://kamal-deploy.org/docs/configuration/overview/), [roles](https://kamal-deploy.org/docs/configuration/roles/).

Kamal's documented `stop_timeout` is the container termination grace, overridable per role. For non-proxied roles its default follows `drain_timeout` (30 seconds by default); proxied roles otherwise use Docker's ten-second default. These are tunable defaults, not a requirement that jobs stop midway. [Documentation](https://kamal-deploy.org/docs/configuration/overview/), [versioned implementation](https://github.com/basecamp/kamal/blob/v2.12.0/lib/kamal/configuration/role.rb).

## Migration acceptance tests

Use an isolated environment and test provider, not production transactional recipients:

1. Deploy while a deliberately long job is active, within the configured grace. Verify it finishes, the old worker takes no new jobs during close, and the new worker consumes waiting jobs.
2. Force termination after a recorded test side effect but before completion acknowledgement. Verify stalled recovery and idempotency prevent a repeated effect. Also exercise the failed-job outcome after repeated stalls.
3. Start a candidate with unavailable Redis. Verify deployment does not treat mere process/HTTP liveness as readiness, and the previous consumer remains available.
4. Exercise old/new payload compatibility, rollback, and internal API calls during worker drain and API replacement. Verify queued jobs from either release remain interpretable.
5. Verify waiting/delayed jobs and scheduler registrations survive deployment with unchanged Redis storage and queue identity. Verify failed jobs are visible and recoverable.
6. Run the full release using the chosen multi-image configuration, including migration failure and partial service failure. Keep CI coordination thin and use tool-provided lifecycle operations; do not rebuild custom deployment state/cleanup orchestration around Kamal.

Outstanding inputs: measured worst-case job duration, acceptable duplicate-email policy, actual VPS resource headroom, installed/live dependency and Redis configuration, and the final proxy/stateful-service ownership boundary. No runtime guarantees or migration effort estimate are claimed from this review.
