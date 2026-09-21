# Moving a production stack from Oracle Cloud to Contabo, and learning Terraform on the way

A working log of migrating Bias Market (NestJS API, Next.js web, BullMQ workers,
Postgres, Redis, MinIO, Caddy, blue/green deploys) from an Oracle Cloud free
tier VM to a paid Contabo VPS, using the migration as a real-world excuse to
learn Terraform. Written as the work happens, so the wrong turns are in here
too. The decision record lives in
[the plan](../plans/2026-09-20-contabo-migration-terraform-plan.md); this file
is the tutorial-shaped version of it, meant to be turned into a blog post.

Each part has the same shape: **what we do**, **the Terraform concept it
teaches**, **what surprised us**.

## Part 0. Why move, and what "provisioning" means here

Oracle ended the free Ampere A1 tier the stack ran on. The replacement is a
Contabo Cloud VPS 4: 4 vCPU, 8 GB RAM, 100 GB SSD, EU region, about $6.60 a
month. It is cheap, and it is **x86_64**, where the old machine was **arm64**.
That difference silently breaks the CI pipeline (it built arm64 images on
purpose), which is the first lesson: a provider migration is never only about
the provider.

A first, useful mental model for the rest of the series. There are three
different jobs, and three different tools:

| Job                                           | Tool here                                     |
| --------------------------------------------- | --------------------------------------------- |
| Create and wire up cloud things (VPS, DNS)    | **Terraform**                                 |
| Configure the machine once, on first boot     | **cloud-init** (handed over by Terraform)     |
| Ship and roll out the application, every push | GitHub Actions + `deploy.sh` (already exists) |

Terraform is deliberately not the deploy tool. It answers "what infrastructure
should exist", not "what version of the app is running".

### The catch nobody mentions in tutorials: the server already exists

The VPS was bought through Contabo's checkout page, so no Terraform state knows
about it. The typical tutorial `resource "contabo_instance"` would happily order
a _second_ server and a second bill. Real projects nearly always start from
"things already exist", so this series uses `terraform import` to adopt them
(Part 4). The same applies to the DNS records and the GitHub environment.

## Part 1. Credentials, and where they live

Terraform providers talk to APIs, so Terraform needs API credentials. Rule used
throughout: **credentials come from environment variables, never from `.tf`
files.** The provider block stays empty and reads them itself.

Contabo needs four values, from the customer panel under _Account, Security,
API_:

| Env var                     | What it is                                                       |
| --------------------------- | ---------------------------------------------------------------- |
| `CNTB_OAUTH2_CLIENT_ID`     | OAuth2 client id (looks like `INT-12345678`)                     |
| `CNTB_OAUTH2_CLIENT_SECRET` | OAuth2 client secret                                             |
| `CNTB_OAUTH2_USER`          | your account **email**                                           |
| `CNTB_OAUTH2_PASS`          | the **API password**, see the note below (not shown on the page) |

**Where is the API password?** Not on the API credentials card. That card shows
only username, client id and client secret (the secret is masked). Contabo's
docs list a fourth "API password", and in the current panel it is set from the
**Password, "Reset via email", Send link** card on the same _Security & Access_
page: the email link lets you choose it. Contabo's docs never say whether this
is the same password you log in with, so treat it as one credential you now
control. You can prove all four values work without Terraform by asking Contabo
for a token directly:

```bash
curl -s -d "client_id=$CNTB_OAUTH2_CLIENT_ID" \
  -d "client_secret=$CNTB_OAUTH2_CLIENT_SECRET" \
  --data-urlencode "username=$CNTB_OAUTH2_USER" \
  --data-urlencode "password=$CNTB_OAUTH2_PASS" \
  -d grant_type=password \
  https://auth.contabo.com/auth/realms/contabo/protocol/openid-connect/token
# success: JSON with an "access_token"; failure: "invalid_grant"
```

Cloudflare needs one API token, scoped to `Zone, DNS, Edit` on a single zone
(least privilege: a leaked token can edit DNS for one domain, not the account).

GitHub needs no new secret. The `github` provider reads `GITHUB_TOKEN`, and the
`gh` CLI already holds a token, so `GITHUB_TOKEN="$(gh auth token --user <acct>)"`
borrows it. It must belong to an account with **admin** on the repo, because
creating or importing environments requires it. (We had three `gh` accounts
logged in and only one of them had admin, which `gh api repos/<repo> --jq
.permissions` shows in a second.)

All of it goes in one file **outside the repository**, sourced by hand:

```bash
# ~/.config/biasmarket/terraform.env   (chmod 600, not in git)
export CNTB_OAUTH2_USER='you@example.com'
export CNTB_OAUTH2_CLIENT_ID='INT-...'
export CNTB_OAUTH2_CLIENT_SECRET='...'
export CNTB_OAUTH2_PASS='...'
export CLOUDFLARE_API_TOKEN='...'
export GITHUB_TOKEN="$(gh auth token --user <admin-account>)"
```

```bash
source ~/.config/biasmarket/terraform.env
```

**Concept: env vars vs `terraform.tfvars`.** Env vars named after the provider
configure the _provider_. `TF_VAR_name` or a `.tfvars` file feed _your own_
input variables. Provider credentials belong in the first group.

**Surprise: the tutorial that started this was slightly wrong.** The blog post
we followed used `oauth2_password`; the real argument is `oauth2_pass`. It also
pinned `~> 0.1` while the provider's own example pins `>= 0.1.44`. When a
tutorial and the provider's repo disagree, the repo wins. Read
`docs/index.md` of the provider on GitHub, since the registry site is a
JavaScript app that is awkward to read from scripts.

## Part 2. The smallest possible Terraform project

Three files, in `infra/terraform/`.

`versions.tf` says which Terraform and which providers this code needs:

```hcl
terraform {
  required_version = ">= 1.7"

  required_providers {
    contabo = {
      source  = "contabo/contabo"
      version = "~> 0.1.44"
    }
  }
}
```

`providers.tf` configures the provider, empty because credentials come from the
environment:

```hcl
provider "contabo" {}
```

`.gitignore` is the third file and the one people skip. It keeps out
`.terraform/` (downloaded plugins), `*.tfstate*` (state can hold secrets) and
`*.tfvars` (real values), and deliberately does **not** ignore
`.terraform.lock.hcl`.

```bash
cd infra/terraform
terraform init       # download the provider, write the lock file
terraform fmt        # canonical formatting
terraform validate   # syntax and internal consistency, no network
terraform plan
```

`init` output that matters: `Installing contabo/contabo v0.1.44`, then a
`.terraform.lock.hcl` appears.

**Concepts.**

- **Provider**: a plugin that translates HCL resources into API calls. `init`
  downloads it into `.terraform/`.
- **Lock file**: records the exact provider version and its checksums, like
  `pnpm-lock.yaml`. Commit it, so CI and teammates get the identical plugin.
- **Version constraint**: `~> 0.1.44` means `>= 0.1.44, < 0.2.0`. The lock file
  then pins the exact one inside that range.

**Surprise: `plan` said "No changes" and proved nothing.** With no resources
declared, Terraform never contacts Contabo, so a wrong password would still
"pass". Credentials are only exercised once a resource or data source reads
from the API, which is the next part. Green output from an empty project is not
a health check.

## Part 3. Reading before owning (data sources)

_To be written when we reach it._ Look up the Ubuntu 26.04 image id, read the
existing VPS as a `data` source, and see the difference between `data` (read
something you do not own) and `resource` (own it).

## Part 4. Adopting the existing VPS (`terraform import`)

_To be written._ `import {}` block, iterating on the resource until `plan` is
empty, what state is and how to read a plan (`~`, `-/+`).

## Part 5. SSH key and cloud-init (and a deliberate reinstall)

_To be written._ Why changing `user_data` reinstalls the server, and how to
notice that in the plan _before_ applying.

## Part 6. DNS with Cloudflare (first import, first `for_each`)

We did DNS before the VPS on purpose: the Contabo API password was not ready,
and importing a DNS record is a gentler first `import` than importing a server.

**What existed.** The zone had nine records. Four are ours (`@`, `api`, `cdn`,
`status`, all proxied A records pointing at the dead Oracle IP). The other five
belong to other things (a Vercel blog, Resend email records, a Google
verification), so Terraform is told about the four only. Terraform manages what
you declare, nothing else, which is why "adopt the whole zone" is a choice, not
a default.

**Second provider.** Add it to `versions.tf`, add `provider "cloudflare" {}` to
`providers.tf` (it reads `CLOUDFLARE_API_TOKEN`), and run `terraform init`
again, because `init` is what downloads providers. Version 5 of the Cloudflare
provider renamed the record resource from `cloudflare_record` to
`cloudflare_dns_record`. To check the real attribute names without a working
docs site:

```bash
terraform providers schema -json | jq '.provider_schemas[] | .resource_schemas.cloudflare_dns_record.block.attributes | keys'
```

**One resource block, four records** with `for_each`:

```hcl
locals {
  app_hosts = {
    root   = "biasmarket.com"
    api    = "api.biasmarket.com"
    cdn    = "cdn.biasmarket.com"
    status = "status.biasmarket.com"
  }
}

resource "cloudflare_dns_record" "app" {
  for_each = local.app_hosts

  zone_id = var.cloudflare_zone_id
  name    = each.value
  type    = "A"
  content = var.origin_ip
  ttl     = 1 # 1 = "automatic", required when proxied
  proxied = true
}
```

Each instance gets an address like `cloudflare_dns_record.app["api"]`. The map
keys, not list positions, identify them, so adding a host later never renumbers
the others (the classic `count` footgun).

**Import.** The records already exist, so we tell Terraform to adopt them. An
`import` block says "the thing at this ID is that resource address":

```hcl
import {
  for_each = local.app_record_ids # { root = "616f...", api = "a462...", ... }

  to = cloudflare_dns_record.app[each.key]
  id = "${var.cloudflare_zone_id}/${each.value}"
}
```

The import ID format is provider-specific (here `<zone_id>/<record_id>`), and
you find it in the provider's docs or by trial. The record IDs came from the
Cloudflare API: `GET /zones/<zone>/dns_records?type=A`.

**The result that matters.** With `origin_ip` still set to the old Oracle IP,
the plan read:

```text
Plan: 4 to import, 0 to add, 0 to change, 0 to destroy.
```

`0 to change` is the point. It means the code we wrote describes reality
exactly. If it had said `~ update in-place`, our code and the live record
disagreed, and we would fix the code (not apply) until they matched. After
`terraform apply` (state-only, nothing changes in Cloudflare) a fresh plan says
`No changes`.

**Reading a plan: the three symbols.**

| Symbol | Meaning                                                   |
| ------ | --------------------------------------------------------- |
| `+`    | will be created                                           |
| `~`    | will be updated in place                                  |
| `-/+`  | will be destroyed and re-created (read these very slowly) |

**A free preview of the cutover.** Overriding the variable on the command line,
plan only, shows exactly what moving traffic to the new server will do:

```bash
terraform plan -var origin_ip=161.97.113.35
#   ~ content = "150.136.181.240" -> "161.97.113.35"
# Plan: 0 to add, 4 to change, 0 to destroy.
```

Four in-place edits, no destroys, and the plan is the whole "runbook". The
actual cutover will be a one-line change (a reference to the VPS instead of a
hardcoded IP) plus `apply`, and it is deliberately held back until the server is
ready to answer.

**Concepts.** Second provider, `for_each` on resources and on `import`,
address-vs-ID (the address is your name for it in code, the ID is the cloud's),
`terraform.tfvars` for real values with a committed `.tfvars.example`, and
"import only proves the code matches once the plan is empty".

**Gotcha.** The Cloudflare token we were given expires in about eight days.
Terraform has no idea; it just starts failing. Tokens with expiry deserve a
calendar reminder.

## Part 7. GitHub secrets from Terraform

_To be written._ Outputs feeding other resources, secrets in state.

## Part 8. Changing the pipeline: arm64 to amd64

The old VM was arm64 (Oracle Ampere), so CI was built to match: the `build-push`
job ran on GitHub's `ubuntu-24.04-arm` runners and pushed arm64 images to GHCR.
Contabo VPSs are x86_64. An arm64 image on an x86_64 host does not degrade, it
fails at container start with `exec format error`, and it would do so only after
a fully green pipeline, which is the nasty part.

The fix is one line, because the workflow never sets `platforms:` on
`docker/build-push-action`. The image architecture is simply whatever the runner
is:

```diff
-    runs-on: ubuntu-24.04-arm
+    runs-on: ubuntu-latest
```

Before trusting that, grep for every other arm assumption (`arm64`, `aarch64`,
`--platform`, Prisma `binaryTargets`, digest-pinned base images). Here there were
none: every `FROM` is a multi-arch tag. This is the part of a cloud migration
that Terraform cannot help with, and the reason to grep the whole repo for the
old provider's assumptions, not only the infra folder.

Side benefit: the x86_64 runner is the default, well-cached and cheaper than the
arm one.

## Part 9. First deploy

_To be written._

## Part 10. What is reusable next time

_To be written._ Which files copy across projects unchanged and which are
project-specific.
