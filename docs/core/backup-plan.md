# Production backup plan

This records the proposed policy for issue
[#485](https://github.com/bobadilla-tech/biasmarket.com/issues/485). It is a
plan, not an installed backup service. Production currently has only the
short-lived pre-migration Postgres dumps described in
[operations.md](operations.md#pre-migration-dumps); those files and all MinIO
objects remain on the VPS.

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
  before committing its database reference, and some delete paths update the
  database before deleting the object. The source buckets currently have no
  versioning. The implementation must preserve object versions across the
  database snapshot boundary or quiesce writes while capturing both stores.
  A restic repository on an S3-compatible service is the preferred implementation
  candidate: it supports [S3-compatible endpoints](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html#s3-compatible-storage),
  encrypts data on the client, and can retain snapshots with a
  [daily/monthly policy](https://restic.readthedocs.io/en/stable/060_forget.html).
  Validate the selected provider's S3 compatibility before committing to it.
- **Schedule:** one complete backup per day, with a proposed 02:00 UTC start.
  This gives a maximum nominal recovery point age of 24 hours. The backup must
  be treated as failed unless both database and all three bucket inputs have
  completed and the remote snapshot is readable.
- **Retention:** keep 30 daily and 12 monthly recovery points. If restic is
  selected, model this as `forget --keep-daily 30 --keep-monthly 12`; verify
  the exact retained snapshots with `--dry-run` before enabling pruning.
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
  Infisical is not currently integrated in this repository, so its runtime
  delivery path must be established before choosing it as the source.
- **Scheduling and alerting:** use a dedicated systemd oneshot service and
  timer, following the existing migration-watchdog unit pattern. Send a Kuma
  push heartbeat only after a verified successful backup; a missed heartbeat
  should alert through an explicitly configured notification channel. Also
  alert on backup command failure, incomplete bucket coverage, and a failed
  repository check. Kuma exists, but real-time notification configuration is
  manual and must be tested with the selected channel.

## Restore acceptance test

The implementation must add a repeatable local test that uses disposable
containers and no production credentials or endpoint:

1. Start a scratch Postgres and MinIO, using a local S3-compatible backup target
   (a second disposable MinIO instance is sufficient).
2. Seed Postgres with representative schema and rows, and seed the products,
   logos, and private payments buckets with distinct objects. Record object
   checksums and verify the payment bucket has no anonymous read policy.
3. Run the same backup entry point used by the timer against these local
   services. Confirm a repository snapshot exists and that the repository
   cannot be read without its encryption credential.
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

## Decisions required before implementation

The policy and retention target are ready for implementation planning. These
items still block a production-capable change:

1. Select the actual off-box provider/account, bucket, endpoint, region, and
   access policy. Confirm it is independent of the VPS failure domain and
   approve its cost and object lifecycle/versioning behavior.
2. Resolve the MinIO/Postgres consistency boundary. A candidate is source
   bucket versioning plus a version-aware object export that preserves the
   versions needed by the database snapshot; validate upload/delete races and
   source-version cleanup in the local restore test. The other safe option is
   to quiesce API writes for the full capture window. Do not use a current-only
   `mc mirror` as the recovery source. Enabling versioning changes source
   storage behavior and can grow the MinIO volume, so it needs its own review.
3. The runtime path is agreed as a root-owned environment file under
   `/home/deploy/biasmarket/env/`, delivered by Infisical. Consume it with a
   dedicated systemd `EnvironmentFile`; keep this scoped to backup secrets and
   do not change `env/shared.env`, Terraform, cloud-init, or the broader
   Infisical integration tracked by issue #228. The production schedule remains
   disabled until credentials and the push URL are provisioned.
4. Define how MinIO data is staged without exhausting the VPS disk or leaving
   plaintext in temporary storage. Current disk capacity and free space were
   not inspected, and no production access was used for this review.
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
  buckets and policies but does not enable bucket versioning.
- The app's `StorageService` uploads bytes before writing the URL reference;
  product removal and store deletion update Postgres before best-effort object
  deletion. A capture that reads Postgres and the unversioned current MinIO
  objects at different times can therefore restore a missing referenced
  object. MinIO's [`mc mirror` documentation](https://docs.min.io/aistor/reference/cli/mc-mirror/)
  says it copies current objects and does not synchronize object version
  history.
- `docs/core/provisioning.md` says a VPS reinstall wipes the database, MinIO,
  Kuma data, and local dumps. Its historical backup suggestions do not select
  an implemented destination.
- `docs/core/operations.md` documents recovery from pre-migration dumps but
  says no scheduled database or MinIO backup exists.
- Existing systemd watchdog units and Kuma push monitors provide a pattern for
  scheduling and missed-heartbeat alerting. A real-time notification receiver
  is not configured by repository code.
