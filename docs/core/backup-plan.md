# Production backup plan

This records the proposed policy for issue
[#485](https://github.com/bobadilla-tech/biasmarket.com/issues/485). It is a
plan and implementation, not an active production backup. Production
currently has only the short-lived pre-migration Postgres dumps described in
[operations.md](operations.md#pre-migration-dumps); those files and all MinIO
objects remain on the VPS.

The PR adds a oneshot backup service, version-aware MinIO exporter, Restic
snapshot verification, a daily timer, and config watcher. Successful deploys
install the systemd units and enable the timer only after `backup.env` passes
preflight; the watcher retries when Infisical later creates or changes that
file. This PR does not initialize a production Restic repository, enable MinIO
versioning in production, or provision backup credentials.

## Proposed policy

- **Coverage:** a full Postgres backup and the `S3_BUCKET` (`products`),
  `S3_LOGO_BUCKET` (`logos`), and `S3_PAYMENT_BUCKET` (`payments`) MinIO
  buckets. Include logos because they are production store content as well as
  product images and payment proofs. Preserve the existing public/private
  bucket policies when restoring MinIO.
- **Format:** use `pg_dump` custom format for scheduled Postgres recovery
  points; keep the existing plain-SQL pre-migration dump unchanged. Back up
  MinIO at the object level, not by copying the live Docker volume. A plain
  live `mc mirror` is not sufficient for a consistent recovery point: it
  copies current objects, not their version history. The app uploads an object
  before committing its database reference, and delete paths update the
  database before deleting the object. The source buckets currently have no
  versioning. The exporter requires versioning and reads exact object versions
  by ID. It lists versions only after `pg_dump` finishes and selects the newest
  non-delete version per key. This relies on the app's immutable UUID object
  keys and its write ordering: object upload completes before the database
  reference is committed; deletes happen after the database reference is
  changed or removed. Thus a DB snapshot cannot reference a later upload, and
  a later delete marker does not hide the referenced value version. This avoids
  relying on database/MinIO clock alignment. Future code that overwrites keys
  or changes upload/delete ordering must revisit this boundary.
  Restic is the selected backup tool. It supports
  [S3-compatible endpoints](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html#s3-compatible-storage),
  encrypts data on the client, and can retain snapshots with a
  [daily/monthly policy](https://restic.readthedocs.io/en/stable/060_forget.html).
  Validate the selected provider's S3 compatibility before committing to it.
- **Schedule:** one complete backup per day, with a proposed 02:00 UTC start.
  This gives a maximum nominal recovery point age of 24 hours. The backup must
  be treated as failed unless both database and all three bucket inputs have
  completed and the remote snapshot is readable. `biasmarket-backup.timer`
  implements this cadence with `Persistent=true`; the deploy hook enables it
  after the root-owned runtime config passes preflight.
- **Retention:** keep 30 daily and 12 monthly recovery points. If restic is
  selected, model this as `forget --keep-daily 30 --keep-monthly 12`; verify
  the exact retained snapshots with `--dry-run` before enabling pruning.
- **MinIO version retention and storage:** versioning keeps overwritten and
  deleted object values on the source volume until lifecycle cleanup. This is
  separate from Restic snapshot retention. Before enabling source versioning,
  estimate added storage and define noncurrent-version expiration only after
  the local capture/restore test; a 30-day window is the proposed starting
  point, not an applied rule. Track `mc du --versions local/products` (and
  `logos`, `payments`) plus host `df -h`; alert on low MinIO volume headroom.
  MinIO documents that a versioned delete creates a marker while earlier
  versions remain readable by version ID, and `mc ls --versions` includes
  version history. Verify these behaviors against the pinned Coolify MinIO
  release in the disposable-container rehearsal before production enablement.
  The pinned server is configured with one data path (`server /data`), MinIO's
  single-node single-drive topology. The pinned release documents versioning
  for erasure-coded backends; MinIO documents single-node single-drive as a
  zero-parity erasure-coded backend. This satisfies the documented topology
  prerequisite, but does not replace testing the exact Coolify image.
  MinIO warns version history can materially increase bucket storage. Verify
  lifecycle syntax against the pinned release before applying a rule:
  [versioning behavior in the pinned server release](https://github.com/minio/minio/blob/RELEASE.2025-10-15T17-29-55Z/docs/bucket/versioning/README.md),
  [the single-node single-drive topology](https://min.io/docs/minio/container/operations/install-deploy-manage/deploy-minio-single-node-single-drive.html),
  [`mc version enable`](https://docs.min.io/aistor/reference/cli/mc-version/mc-version-enable/),
  [`mc cp` version selection](https://docs.min.io/aistor/reference/cli/mc-cp/),
  [`mc du`](https://docs.min.io/aistor/reference/cli/mc-du/),
  [`mc ilm rule add`](https://docs.min.io/aistor/reference/cli/mc-ilm-rule/mc-ilm-rule-add/).
- **Off-box destination:** a private S3-compatible bucket outside the VPS and,
  preferably, outside the VPS provider's account. Use TLS and a dedicated
  least-privilege identity scoped to the backup bucket. Do not reuse MinIO's
  application keys. Provider, account, bucket, endpoint, region, lifecycle,
  and expected monthly storage/egress cost still need to be selected.
- **Encryption and secrets:** prefer client-side repository encryption. Keep
  the encryption recovery material separately from the VPS and destination;
  loss of the restic password makes the repository unrecoverable. Inject the
  destination credentials and repository password at runtime from Infisical
  or another approved environment/secret injection mechanism. Never put secret
  values in Git, Terraform state, cloud-init, command-line arguments, or logs.
  The agreed runtime path is a root-owned `env/backup.env` under
  `/home/deploy/biasmarket`, delivered by Infisical. The broader integration
  is tracked separately in issue #228; this PR reads that file through the
  manual backup service and its preflight.
- **Scheduling and alerting:** use a dedicated systemd oneshot service and
  timer, following the existing migration-watchdog unit pattern. Send a Kuma
  push heartbeat only after a verified successful backup; a missed heartbeat
  should alert through an explicitly configured notification channel. Also
  alert on backup command failure, incomplete bucket coverage, and a failed
  repository check. Kuma exists, but real-time notification configuration is
  manual and must be tested with the selected channel.

## Restore acceptance test before production use

Run a repeatable local test with disposable containers and no production
credentials or endpoint before enabling production capture:

1. Start a scratch Postgres and MinIO, using a local S3-compatible backup target
   (a second disposable MinIO instance is sufficient).
2. Seed Postgres with representative schema and rows, and seed the products,
   logos, and private payments buckets with distinct objects. Record object
   checksums and verify the payment bucket has no anonymous read policy.
3. Run the same backup entry point used by the manual systemd service against
   these local services. Confirm a repository snapshot exists and that the
   repository cannot be read without its encryption credential.
4. Destroy the source containers and volumes. Create empty replacements, then
   restore the selected snapshot using the documented recovery commands.
5. Compare database schema/rows and each object checksum with the seeded
   values. Verify the payment bucket remains private and public buckets remain
   publicly readable only if that is still the intended application policy.
6. Exercise retention against synthetic dated snapshots and assert that the
   policy keeps 30 daily plus 12 monthly recovery points before enabling
   deletion against a real repository.

Record the exact command and expected result in this document or the test
script. A successful upload or repository check alone does not prove that a
restore works. No production restore has been run as part of this plan.

## Remaining blockers before production use

These items still block a production backup:

1. Select the actual off-box provider/account, bucket, endpoint, region, and
   access policy. Confirm it is independent of the VPS failure domain and
   approve its cost and object lifecycle/versioning behavior.
2. Before production capture, enable versioning on the three source buckets
   through an explicitly reviewed operator change, and define source-version
   lifecycle and volume monitoring. This PR does not change production
   buckets. The code requires versioning and fails closed if a bucket is not
   enabled. Do not use a current-only `mc mirror` as the recovery source.
   The operator commands are `mc version enable minio/products`,
   `mc version enable minio/logos`, and `mc version enable minio/payments`;
   review added storage and pinned-release behavior first. These commands are
   documentation only and were not run against production.
3. The runtime path is agreed as a root-owned environment file under
   `/home/deploy/biasmarket/env/`, delivered by Infisical. Consume it with a
   dedicated systemd `EnvironmentFile`; keep this scoped to backup secrets in
   `env/backup.env`, separate from `env/shared.env` and the broader Infisical
   integration tracked by issue #228. Cloud-init grants deploy sudo access to
   the setup helper; changing `user_data` can trigger a VPS reinstall, so do
   not apply that infrastructure change without reviewing the Terraform
   plan. The setup helper leaves the timer disabled and logs a failure while
   credentials or the push URL are missing or malformed, then enables it
   automatically when the config passes its shape check. The check does not
   contact either storage service or validate MinIO versioning. Provision the
   config only after those production prerequisites and the disposable restore
   rehearsal are complete.
4. Before production capture, inspect VPS disk capacity and choose a protected
   staging filesystem. The service stages plaintext Postgres and object files
   under `state/backup-stage`, owned by the dedicated container UID 10001 with
   mode 0700. It checks free space before dumping and exporting and removes the
   stage after each run. Restic encrypts data before upload, but local staging
   is not encrypted by this implementation. Do not run it until local disk
   capacity and protection are accepted.
5. Store and rehearse recovery of the client-side encryption credential outside
   the VPS, including who can retrieve it during a server-loss incident.
6. Verify the Kuma notification receiver and failure alert. The backup heartbeat
   can use the existing push-monitor pattern, but this repository does not
   provision the receiver or the backup monitor URL.
7. Confirm the nominal 24-hour RPO is acceptable and set an RTO target for
   database plus object restoration.

## Evidence in the current repository

- `infra/vps/lib/migrate.sh` writes compressed plain-SQL pre-migration dumps to
  `releases/` and prunes them after 14 days by default.
- `infra/vps/docker-compose.yml` defines the three MinIO buckets and stores
  their objects only in the `minio_data` named volume. `minio-init` creates
  buckets and policies but does not enable bucket versioning. The manual
  `backup` Compose profile is opt-in and is not scheduled.
- The app's `StorageService` uploads bytes before writing the URL reference;
  product removal and store deletion update Postgres before best-effort object
  deletion. A capture that reads Postgres and the unversioned current MinIO
  objects at different times can therefore restore a missing referenced
  object. MinIO's [`mc mirror` documentation](https://docs.min.io/aistor/reference/cli/mc-mirror/)
  says it copies current objects and does not synchronize object version
  history.
- `infra/vps/backup.py` checks versioning and list-version access before
  dumping, lists object versions after `pg_dump`, downloads each selected
  value by explicit `VersionId`, records a manifest, verifies that the Restic
  snapshot is readable, applies Restic retention, and runs `restic check`
  before reporting success. Its unit tests cover delete-marker interleaving,
  a safe post-snapshot upload extra, and exact-version downloads.
- MinIO versioning increases source-volume usage as object deletions and
  overwrites accumulate. The app's UUID keys avoid normal overwrites, but
  deletes still leave prior values. Monitor per-bucket versioned usage and
  host free space; Restic retention does not reclaim MinIO space.
- `docs/core/provisioning.md` says a VPS reinstall wipes the database, MinIO,
  Kuma data, and local dumps. Its historical backup suggestions do not select
  an implemented destination.
- `docs/core/operations.md` documents recovery from pre-migration dumps but
  says no scheduled database or MinIO backup exists.
- Existing systemd watchdog units and Kuma push monitors provide a pattern for
  scheduling and missed-heartbeat alerting. A real-time notification receiver
  is not configured by repository code.

## Config preflight artifact

`infra/vps/bin/backup-config-check.sh --self-test` validates the checker using
fake values without network access. On a provisioned VPS,
`systemctl start biasmarket-backup-config.service` validates the root-owned
`env/backup.env` through systemd's `EnvironmentFile` parser. The preflight only
checks required settings, HTTPS destination shape, passphrase length, and
distinct source bucket names; it does not connect to any service or disclose
setting values. `systemctl start biasmarket-backup.service` runs one capture
using the currently deployed image and is manual only. The `.example` file
contains names and non-secret defaults only. A disposable-container
backup-and-restore rehearsal remains required before production use; the local
Docker daemon was unavailable during implementation, so it was not run here.
