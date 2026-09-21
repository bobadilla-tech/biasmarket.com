# Migrate production from Oracle Cloud to Contabo, provisioned with Terraform

## Status

**In progress.** Written at the start of the migration and updated phase by
phase as work lands. Each phase records what was decided and why, so this file
becomes the changelog for the migration when it is done.

## Context

Oracle Cloud dropped the free tier the production stack ran on (Ampere A1,
arm64). Production moves to a Contabo **Cloud VPS 4** (4 vCPU, 8 GB RAM, 100 GB
SSD, 200 Mbit/s, EU region, **x86_64**, ~$6.60/mo on a 1-month term) that was
ordered by hand through Contabo's web checkout on 2026-09-20 (Ubuntu 26.04, IP
`161.97.113.35`). Cost is the constraint: one small machine, no second
environment yet.

The migration is also a learning vehicle. The maintainer is learning Terraform,
so the infrastructure is written as Terraform in this repo, and each phase
introduces one Terraform concept against a real resource instead of a toy
example. The layout is kept reusable so the next project can copy the skeleton.

### What already exists (drives the whole plan)

- The VPS **already exists** and is **not** in any Terraform state. A plain
  `resource "contabo_instance"` would order a _second_ VPS and a second bill. It
  has to be **imported**.
- DNS for `biasmarket.com` is on **Cloudflare** (`jerome`/`sarah` nameservers).
  `biasmarket.com`, `api.`, `cdn.` and `status.` currently resolve to Cloudflare
  edge IPs, so the records are **proxied** (orange cloud), and they also already
  exist, so they too are imported rather than created.
- The production stack (`infra/vps/`) is provider-agnostic except for the two
  arm64 assumptions below and the Oracle wording in the docs.

## Decisions (from the kickoff Q&A)

| Question          | Decision                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Existing VPS      | Import it into Terraform state, no second instance                                                |
| DNS               | Cloudflare, managed by Terraform                                                                  |
| Terraform scope   | Contabo instance + SSH key, Cloudflare DNS, GitHub `production` environment, cloud-init bootstrap |
| OS image          | Keep Ubuntu 26.04 (docs were written for 24.04, so verify each provisioning step, see Risks)      |
| State (to start)  | Local, gitignored. Moves to a remote backend in the last phase                                    |
| Terraform vs Tofu | Terraform (`contabo/contabo` provider is published on the Terraform registry)                     |

## Findings that changed the plan

1. **Architecture mismatch.** `.github/workflows/cd.yml` builds images on
   `ubuntu-24.04-arm` because the old VPS was arm64. Contabo VPS is x86_64, so
   arm64 images would die with `exec format error`. Fix:
   `runs-on: ubuntu-latest` in `build-push`, and update the comment above it. No
   `platforms:` is set on `build-push-action`, so the runner architecture
   decides the image architecture, and the Dockerfiles contain no arch-specific
   steps.
2. **Blog snippet is inaccurate.** Verified against the provider repo
   (`contabo/terraform-provider-contabo`):
   - the password argument is `oauth2_pass`, not `oauth2_password`;
   - credentials can come from `CNTB_OAUTH2_CLIENT_ID`,
     `CNTB_OAUTH2_CLIENT_SECRET`, `CNTB_OAUTH2_USER`, `CNTB_OAUTH2_PASS`, which
     keeps them out of `.tf` files entirely. Preferred here;
   - `oauth2_user` is the account **email**, and the API password is set
     separately in the Customer Control Panel (not the login password);
   - the pinned example version is `>= 0.1.44`, not `~> 0.1`;
   - `image_id`, `user_data` and `root_password` **each reinstall the server
     when changed** (data on the disk is lost). A `plan` that touches any of
     them must be read carefully.
3. **Root password leaked into the kickoff chat** (Contabo's order page shows it
   in plaintext). It is treated as compromised. Mitigation is part of Phase 4:
   the reinstall applies an SSH key + cloud-init that disables password login,
   and the old password stops being valid. Until then, change it in the panel.
4. **Cloudflare proxy + Caddy.** With proxied records, Caddy's ACME HTTP-01
   still works, but the zone's SSL mode must be **Full (strict)**, otherwise
   Cloudflare talks plain HTTP to the origin and can redirect-loop against
   Caddy's automatic HTTPS. Decide the proxied flag per record in Phase 6.

## Target layout

```text
infra/terraform/
  versions.tf        terraform {} block: required_version, required_providers
  providers.tf       provider blocks (auth via env vars, no secrets in files)
  variables.tf       every input, with description/type/sensitive
  contabo.tf         secret (SSH key), image data source, instance
  cloud-init.yaml.tftpl   templatefile() input for user_data
  cloudflare.tf      DNS records
  github.tf          production environment, secrets, variables
  outputs.tf         ip, ssh command, fingerprints
  imports.tf         import {} blocks (removed once state has the resources)
  terraform.tfvars.example   committed, no real values
  .gitignore         *.tfstate*, .terraform/, *.tfvars (NOT .terraform.lock.hcl)
```

Split by _provider/concern_, not by resource type. Terraform loads every `.tf`
file in the directory as one configuration, so the split is purely for humans.

## Phases

Each phase ends with a checkpoint the maintainer runs themselves
(`init`/`plan`/`apply`) so the output is read by a person, not just by tooling.

### Phase 0. Prerequisites (maintainer)

- Install Terraform
  (`brew tap hashicorp/tap && brew install hashicorp/tap/terraform`).
- Contabo: Customer Control Panel, Account, Security, API. Collect client ID,
  client secret, API user (email) and set an **API password**.
- Cloudflare: API token scoped to **Zone, DNS, Edit** on `biasmarket.com` only.
  Also note the zone ID.
- GitHub: fine-grained token limited to this repo with Environments, Secrets and
  Variables (read/write) plus Administration for environments.
- Export everything as env vars in the shell, never in a file in the repo.
- Change the leaked root password (Finding 3).

_Concept: least-privilege API credentials, env vars vs tfvars._

### Phase 1. Scaffold and provider auth

Create `infra/terraform/` with `versions.tf`, `providers.tf`, `.gitignore`. Run
`terraform init`, `terraform validate`, `terraform plan` (expect "no changes").
Commit `.terraform.lock.hcl`.

_Concepts: providers, `required_providers`, the lock file, what `init` does, why
`.terraform/` is ignored but the lock file is not._

### Phase 2. Data sources (read-only)

`data "contabo_image"` for Ubuntu 26.04 (look the ID up via the Contabo API or
`cntb get images`, then hard-code the UUID as a variable with a comment). Read
the existing instance as a data source to see the shape of its attributes.

_Concept: `data` vs `resource`; Terraform can read without owning._

### Phase 3. Import the existing VPS

Add an `import {}` block (Terraform >= 1.5) and a matching
`resource "contabo_instance" "main"`. Run `terraform plan` and iterate on the
resource arguments until the plan shows **no changes**. That is what "the code
matches reality" means. Inspect with `terraform state show`.

Watch for: `period` must match the ordered term (1), `region = "EU"`,
`product_id` must equal the ordered product, otherwise the plan proposes a
replacement. If the plan says `must be replaced`, stop and read why before
anything else.

_Concepts: state file, import, drift, `terraform state list/show`, reading a
plan (`~` update in place, `-/+` replace, `+/-`)._

### Phase 4. SSH key, cloud-init, and the deliberate reinstall

- `contabo_secret` (type `ssh`) holds the maintainer's **public** key; the
  instance references it via `ssh_keys = [contabo_secret.admin.id]`.
- `user_data` from `templatefile("cloud-init.yaml.tftpl", {...})` performs
  provisioning Steps 1-4 of
  [blue-green-migrations.md](../core/blue-green-migrations.md): apt packages,
  Docker Engine, the `deploy` user (docker group),
  `/opt/biasmarket/{env,caddy/active,state,releases}`, `rrsync`, the two
  restricted `authorized_keys` lines, `ufw` (22/80/443 only),
  `PasswordAuthentication no`, `PermitRootLogin prohibit-password`, and a
  swapfile (8 GB RAM with two colours briefly running is tight, swap is cheap
  insurance).
- **Only public keys and non-secret values go in `user_data`.** It is stored by
  Contabo and appears in Terraform state.
- Applying this **reinstalls** the imported VPS. Acceptable because it is empty.
  The plan output for this step is the main teaching moment: it shows an "update
  in place" that the provider docs reveal is actually destructive.

_Concepts: resource references and implicit dependencies, `templatefile()`,
`sensitive`, why some argument changes are destructive, cloud-init vs Terraform
(Terraform creates the machine, cloud-init configures it once on first boot,
neither replaces the deploy scripts in `infra/vps/`)._

### Phase 5. Deploy keys

Decision to make with the maintainer, both viable:

- **A. Generated outside Terraform** (the existing doc, Step 3). Private keys
  never enter state; paste them into GitHub by hand, or via `TF_VAR_`.
- **B. `tls_private_key` in Terraform.** Public halves feed cloud-init, private
  halves feed GitHub secrets, fully automated, but **private keys live in
  state**, so state must be treated as a secret (fine while local and
  gitignored, and a real reason for encrypted remote state in Phase 10).

_Concepts: state contains secrets, the `tls` and `random` providers, the trade
between automation and secret exposure._

### Phase 6. Cloudflare DNS

Import the four existing records (`@`, `api`, `cdn`, `status`), then repoint
`content` at `contabo_instance.main.ip_config[0].v4[0].ip` (attribute path to be
confirmed with `terraform show` after Phase 3). Use `for_each` over a map of
subdomains. Keep `proxied` as it is today unless Caddy TLS fails, then flip per
Finding 4.

_Concepts: a second provider, cross-provider references (change the VPS, DNS
follows), `for_each`, import IDs (`<zone_id>/<record_id>`), Cloudflare provider
v5 vs v4 resource names (verify at write time)._

### Phase 7. GitHub production environment

`github_repository_environment` `production`,
`github_actions_environment_secret` for `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`,
`DEPLOY_SSH_KNOWN_HOSTS`, `DEPLOY_SSH_KEY_RSYNC`, `DEPLOY_SSH_KEY_DISPATCH`, and
repo-level variables for the `NEXT_PUBLIC_*` values. Replaces the manual Step 6
in the provisioning doc.

`DEPLOY_SSH_KNOWN_HOSTS` needs the VPS's host key. Contabo has no Oracle-style
serial console, so verify the fingerprint out-of-band via the panel's VNC
console (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`) against
`ssh-keyscan`, then store it.

_Concepts: outputs feeding other resources, `sensitive` values, managing
non-cloud things with the same workflow._

### Phase 8. Repo changes outside Terraform

- `cd.yml`: `build-push` to `ubuntu-latest` (Finding 1).
- Docs: replace Oracle wording in
  `docs/core/{blue-green-migrations,deploy,infra,docker,architecture,product}.md`,
  point the provisioning section at `infra/terraform/` (cloud-init replaces
  Steps 1-4, Terraform replaces Step 6) and fix the known_hosts step for
  Contabo.
- Verify each remaining manual step against **Ubuntu 26.04**: `get.docker.com`
  support, the `rrsync` gz path, `rsync`/`openssh-server` package names.

### Phase 9. First deploy

Follow the remaining manual steps that Terraform does not own: `env/*.env` files
on the VPS, the first rsync, `deploy.sh --bootstrap`, GHCR package visibility
(public, from the first successful build), Kuma monitors
(`scripts/setup-kuma.ts`). Then verify with the commands in
[deploy.md](../core/deploy.md#verification).

### Phase 10. Follow-ups (learning extensions, not blockers)

- Remote state (Cloudflare R2 is S3-compatible, so the `s3` backend works) with
  state locking discussed and encryption.
- Extract a reusable module (`modules/contabo-vps`) once a second project needs
  it.
- Workspaces vs directory-per-environment for a future staging box.
- `terraform destroy` semantics on Contabo (it schedules cancellation, it does
  not refund) and `cancel_date`.

## What is reusable for the next project

| Reusable as-is                                      | Project-specific                            |
| --------------------------------------------------- | ------------------------------------------- |
| `versions.tf`, `providers.tf`, `.gitignore`, layout | domain and subdomain map                    |
| Contabo secret + instance + `templatefile` pattern  | packages / users in `cloud-init.yaml.tftpl` |
| Cloudflare `for_each` records pattern               | which secrets GitHub needs                  |
| Env-var authentication and import workflow          | `deploy.sh` and the blue/green stack itself |

## Risks and open items

- **Data on Oracle.** Unknown whether the Oracle instance still runs and whether
  Postgres/MinIO data needs migrating (`pg_dump`, `mc mirror`). The Phase 4
  reinstall wipes the Contabo box, so this must be settled before Phase 9.
- **Ubuntu 26.04 is newer than everything in the docs.** Budget for small fixes
  in Phase 8.
- **Memory.** No `mem_limit` is set in `infra/vps/docker-compose.yml`. Two Nest,
  two Next.js, two workers, Postgres 18, Redis, MinIO, Kuma and Caddy share 8 GB
  during a cutover. Watch `docker stats` on the first deploy.
- **Contabo provider is community-maintained** and narrower than the
  DigitalOcean one (no firewall resource, so `ufw` in cloud-init). Pin the
  provider version and read each `plan`.
- **Import ID format** for `contabo_instance` is confirmed against the live
  provider during Phase 3 (the docs page has no import section).
- **State holds secrets** (API tokens do not, but keys, `user_data` and GitHub
  secret values do). Never commit `terraform.tfstate*` or `*.tfvars`.
