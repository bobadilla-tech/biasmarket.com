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
`gh` CLI already holds a token, so
`GITHUB_TOKEN="$(gh auth token --user <acct>)"` borrows it. It must belong to an
account with **admin** on the repo, because creating or importing environments
requires it. (We had three `gh` accounts logged in and only one of them had
admin, which `gh api repos/<repo> --jq
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
tutorial and the provider's repo disagree, the repo wins. Read `docs/index.md`
of the provider on GitHub, since the registry site is a JavaScript app that is
awkward to read from scripts.

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
"pass". Credentials are only exercised once a resource or data source reads from
the API, which is the next part. Green output from an empty project is not a
health check.

## Part 3. Reading before owning (data sources)

Before declaring anything that can cost money, ask the API what is actually
there. First with a raw token (`curl` to
`api.contabo.com/v1/compute/instances`), then through Terraform. Two things came
out of it that no tutorial would have told us:

- The VPS is instance **`203595710`**, product **`V153`** ("Cloud VPS 4
  (2026)"). The blog post we started from used `V91`. Product codes change with
  each generation of plans, so copying one from an article would have described
  a different (or nonexistent) machine.
- It carries an **add-on** (`id 1501`) and has **no SSH keys**, only a password.
  Any resource block that leaves the add-on out would be read by Terraform as
  "remove it".

The Ubuntu 26.04 image UUID (`f5193fe6-...`) came from the same API
(`GET /v1/compute/images?search=ubuntu`), which lists every image with its ID.

Then the read-only Terraform:

```hcl
data "contabo_image" "os" {
  id = var.contabo_image_id
}

data "contabo_instance" "existing" {
  id = var.contabo_instance_id
}
```

`terraform plan` runs these lookups and prints them as new outputs. It ends with
"You can apply this plan to save these new output values to the Terraform state,
without changing any real infrastructure", which is the sentence to remember: a
plan with only data sources and outputs cannot modify anything.

**Concepts.** `data` vs `resource` (look up vs own), variables for IDs that are
not secret but are environment-specific, and outputs as a debugging window into
what a provider actually returns.

**Surprise.** In the first version of that output, `period` and `region` were
`null` (we dropped them from the output afterwards, an output that prints `null`
is noise). The API simply does not report them when you read an instance. Hold
that thought.

**Bonus finding: a firewall resource exists.** The blog post said the community
provider is limited. The registry schema (via
`terraform providers schema -json`) shows a `contabo_firewall` resource, and the
panel announced a free firewall the same week. Guides age faster than providers.

## Part 4. Adopting the existing VPS (`terraform import`)

```hcl
resource "contabo_instance" "main" {
  product_id = "V153"
  region     = "EU"
  image_id   = data.contabo_image.os.id
  period     = 1

  add_ons {
    id       = 1501
    quantity = 1
  }
}

import {
  to = contabo_instance.main
  id = var.contabo_instance_id
}
```

**First plan:** `1 to import, 1 to change`. Not empty. The change was
`+ period = 1` and `+ region = "EU"`, the same two fields that read back as
`null` in Part 3. Terraform saw "state says null, code says a value" and
proposed an in-place update. Applying an update to a paid, running server
because of two fields the API cannot even report is exactly the kind of plan you
stop and think about.

**The fix is to say so out loud**, with `lifecycle`:

```hcl
lifecycle {
  ignore_changes = [period, region]
}
```

The values stay in the code as documentation (and are used if the resource is
ever created fresh), but Terraform stops comparing them after import.

**Safety net:** `prevent_destroy = true` in the same `lifecycle` block makes any
plan that would destroy or replace the VPS fail outright. And the `import` block
stays in the repo while state is local: a fresh clone has no state, and without
it `terraform plan` would propose creating a _second_ VPS.

**Second plan:** `1 to import, 0 to add, 0 to change, 0 to destroy`. Only then
did we `apply`, which wrote the server into state and did nothing to the server
(SSH kept answering throughout). A third plan says `No changes`.

**Concepts.** `import` again (this time a resource that costs money),
`lifecycle.ignore_changes`, and the rule for imports: keep adjusting the code
until the plan is empty, and never `apply` a non-empty plan you have not read.

**Safety notes learned here.**

- In this provider, changing `image_id`, `user_data` or `root_password` on an
  existing instance **reinstalls** it. None of them are in the imported plan.
  They arrive in Part 5, on purpose.
- `ssh_keys` and `root_password` take **numeric secret IDs**, not the key or the
  password itself. The key lives in a separate `contabo_secret` resource.

## Part 5. SSH key, cloud-init, and a deliberate reinstall

Three ideas meet here: a secret that holds your public key, keys that Terraform
generates itself, and `user_data` (cloud-init), the script that configures a
server the first time it boots.

```hcl
resource "contabo_secret" "admin_ssh" {
  name  = "biasmarket-admin"
  type  = "ssh"
  value = trimspace(var.admin_ssh_public_key)
}

resource "tls_private_key" "host"            { algorithm = "ED25519" }
resource "tls_private_key" "deploy_rsync"    { algorithm = "ED25519" }
resource "tls_private_key" "deploy_dispatch" { algorithm = "ED25519" }

resource "contabo_instance" "main" {
  # ...
  ssh_keys  = [tonumber(contabo_secret.admin_ssh.id)]
  user_data = local.user_data # templatefile("cloud-init.yaml.tftpl", {...})
}
```

The cloud-init file does what used to be four manual runbook steps: installs
Docker, creates the `deploy` user, writes two _restricted_ `authorized_keys`
lines (rsync-only and one-command-only, see the deploy docs), opens the firewall
for 22/80/443, disables SSH password login, and adds swap. `templatefile()`
fills in the public keys, so the file is a template with `${...}` holes.

**Read the plan: it lies, politely.**

```text
# contabo_instance.main will be updated in-place
~ ssh_keys  = [] -> (known after apply)
+ user_data = (sensitive value)
Plan: 4 to add, 1 to change, 0 to destroy.
```

`update in-place` describes the API call (a PATCH, not a delete-and-recreate).
It does not say that this provider **reinstalls the operating system and wipes
the disk** when `user_data`, `image_id` or `root_password` change. Terraform
cannot know that; only the provider's documentation does. So the discipline is:
for every argument that changes in a plan, know what the provider does with it.
Here the disk was empty, so we applied. On a server with data this same plan
would have been a disaster with a green tick.

We also saved the plan first (`terraform plan -out=file`,
`terraform apply file`) so that what we applied was exactly what we had read,
and then deleted the file, because a saved plan contains the secrets too.

**Verify, don't assume.** Terraform finished in 44 seconds, which only means
Contabo accepted the request. The actual first boot took a few more minutes.
Login proved the important part: SSH with `StrictHostKeyChecking=yes` against a
`known_hosts` line built from **Terraform's own host key**. We had generated the
server's SSH host key in Terraform and injected it through cloud-init, so we
knew its fingerprint before the machine existed. That removes the awkward
"verify the fingerprint through a web console" step from the runbook.

Then the checks on the server: Docker 29, `deploy` user in the `docker` group,
`ufw` active on 22/80/443, 4 GB swap, `/opt/biasmarket` owned by `deploy`, and
`sshd -T` reporting password login off.

**Surprises.**

- `cloud-init status` said `error`. The cause was not our config: Contabo
  injects its own cloud-config (a `bootcmd` that sets `PermitRootLogin yes` and
  a root password), and its `pkill -HUP sshd` step fails on Ubuntu 26.04 because
  the service is named `ssh`. Harmless, but a lesson: when a platform layers its
  own first-boot config over yours, "error" needs reading, not panicking. Check
  the real end state instead of the summary flag.
- Ubuntu ships `50-cloud-init.conf` with `PasswordAuthentication yes`. Ours
  (`10-...`) wins because sshd reads drop-ins in lexical order and the first
  value it sees is the one it keeps. `sshd -T` prints the effective config and
  is the only honest way to check.
- `user_data` contains the host's **private** key and the plan hides it as
  `(sensitive value)`. That protects the terminal, not the state file.

**The state-file lesson.** `terraform.tfstate` now holds three private keys in
plain text (the two deploy keys and the host key). Terraform's `sensitive` flag
only hides values in command output. Consequence: the state file must be treated
as a secret. It is gitignored, and a later part moves it to encrypted remote
storage. The alternative, generating keys outside Terraform, keeps them out of
state at the cost of manual steps; both are legitimate, and the trade-off is the
lesson.

**Concepts.** `contabo_secret` and referencing one resource from another (an
implicit dependency: Terraform creates the secret first because the instance
mentions it), `tls_private_key`, `templatefile()`, saved plans, `sensitive`,
destructive in-place updates, cloud-init vs Terraform.

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

**Gotcha: a token that can read but not write.** Import and `plan` worked, then
the cutover `apply` failed on all four records with the unhelpful
`Error: failed to make http request`. Nothing had changed in Cloudflare. The
cause was in the token itself: asking the API for its own policies
(`GET /accounts/<id>/tokens/<token id>`) showed every permission group was
`... Read`, with no `DNS Edit`. Reads succeed with a read-only token, so the
whole import phase looked healthy. Lessons: (1) `plan` only proves read access,
so test write access with the smallest possible change before the big one; (2)
when a provider wraps an error in a generic message, go around it and ask the
API directly (read-only) what your credentials are allowed to do.

**Gotcha.** The Cloudflare token we were given expires in about eight days.
Terraform has no idea; it just starts failing. Tokens with expiry deserve a
calendar reminder.

## Part 7. GitHub secrets from Terraform

The repo already had a `production` environment and five `NEXT_PUBLIC_*`
variables, created by hand for the old server. The `github` provider can manage
them, so the CD pipeline's credentials come from the same place as the server.

```hcl
resource "github_repository_environment" "production" {
  repository  = "biasmarket.com"
  environment = "production"
}

resource "github_actions_environment_secret" "deploy" {
  for_each = toset(["DEPLOY_SSH_HOST", "DEPLOY_SSH_USER", "DEPLOY_SSH_KNOWN_HOSTS",
                    "DEPLOY_SSH_KEY_RSYNC", "DEPLOY_SSH_KEY_DISPATCH"])

  repository      = "biasmarket.com"
  environment     = github_repository_environment.production.environment
  secret_name     = each.value
  plaintext_value = local.deploy_secret_values[each.value]
}
```

The values are references: the server IP comes from the instance, the private
keys from the `tls_private_key` resources, the pinned host key from the host key
resource. If the VPS is ever rebuilt, `terraform apply` rewrites the secrets
that depend on it. One source of truth, no copy-paste.

**Auth without a new token.** The provider reads `GITHUB_TOKEN`, and the `gh`
CLI already had one. Creating environments needs repo **admin**, and of three
logged in accounts only one had it: `gh api repos/OWNER/REPO --jq .permissions`.

**Gotcha: `for_each` and sensitive values.** The natural version iterates over a
map whose values are secrets. Terraform refuses: sensitive values cannot be used
in `for_each`, because the keys would leak into the plan. The fix is to loop
over a plain list of secret _names_ and look the value up inside the block, as
above.

**Import vs write-only.** The environment and the variables existed already, so
they were imported (`id = "biasmarket.com:production"`, `"repo:VARIABLE"`), with
`0 to change` proving our code matched. The secrets cannot be imported: GitHub
never returns a secret's value, so Terraform cannot compare. It shows them as
"to be created" and simply overwrites the old (Oracle-era) values. After apply
the plan was empty, and `gh api .../environments/production/secrets` showed all
five with fresh timestamps.

**Concepts.** Outputs of one provider feeding another, write-only resources,
import ID formats that differ per provider, and the mismatch between what a
resource can _read back_ and what it can _write_.

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
`--platform`, Prisma `binaryTargets`, digest-pinned base images). Here there
were none: every `FROM` is a multi-arch tag. This is the part of a cloud
migration that Terraform cannot help with, and the reason to grep the whole repo
for the old provider's assumptions, not only the infra folder.

Side benefit: the x86_64 runner is the default, well-cached and cheaper than the
arm one.

## Part 9. First deploy (four things that went wrong, in order)

By now Terraform had done its job: a provisioned server, DNS ready to move, the
CI secrets in place. Getting the _application_ onto it is a different tool's job
(`deploy.sh`), and this is where reality pushed back.

**Setup.** Secrets for the app (`env/shared.env` and friends) are deliberately
not in Terraform: they would land in state and have a checksum baseline that
`deploy.sh` enforces. Instead they were generated _on the server_ with
`openssl rand`, so they exist nowhere else. Only the external ones (Resend,
Sentry DSNs) came from outside.

**1. The chicken-and-egg in CD.** After merging, CI went green and CD built the
three amd64 images, then failed at its _first_ SSH step. That step (a staleness
guard) runs a script that only arrives on the server during the rsync step
_after_ it. On a server that has never been deployed to, the pipeline cannot
bootstrap itself. The workaround that night was one manual first sync, as the
runbook says. Afterwards the guard itself was fixed: `ssh` returns the remote
command's exit status, so "the script isn't installed yet" is exit `127` while
"the connection failed" is `255`. The guard now skips its ancestry check only on
`127` and still fails hard on anything else, so a fresh server no longer needs a
hand-made sync. The first CD run still ends red at its last step, by design,
because bootstrap is manual-only.

**2. The rsync that worked on CI and not on my laptop.** The manual sync failed
with `rrsync error: invalid rsync-command syntax or options`. The server was
fine. macOS's `/usr/bin/rsync` is not rsync any more: it is Apple's
**openrsync** (protocol 29, "2.6.9 compatible"), which the Python `rrsync`
shipped with Ubuntu 26.04 rejects. Running the same command from an Ubuntu 24.04
container (rsync 3.2.7, what GitHub's runners have) worked. Useful reflex: when
"it works in CI but not locally", compare the _client tool_, not just the flags.

**3. MinIO disappeared from Docker Hub.** Bootstrap stopped before starting a
single container: `pull access denied for minio/mc, repository does not exist`.
MinIO had stopped publishing images on Docker Hub. The stack only ever worked on
the old server because the layers were already cached there, and the compose
file used the floating `latest` tag. A fresh machine is the first honest test of
"can I rebuild this from nothing?" and this is what it found. The images still
exist on `quay.io/minio/*`, so the fix was to repoint both services and to _pin_
the tags instead of trusting `latest`. It is also a small piece of
infrastructure hygiene worth remembering: pin what you depend on, because the
registry can take it away.

**4. Hot-patching, and the debt it creates.** To keep moving, the fixed compose
file was copied onto the server by hand, then the same change went into the repo
as a PR. That order matters: CD's rsync runs with `--delete`, so a hand edit on
the server is silently reverted by the next deploy unless the repo already says
the same thing. Manual fixes on a server are a loan, and the PR is the
repayment.

**Bootstrap.** Then `deploy.sh --bootstrap <sha>` ran as the `deploy` user. It
pulled the images, applied every migration to the empty database (the old
`DROP TABLE` migrations are fine on an empty DB, and bootstrap passes the
destructive flag), started the `blue` color, waited for health, and started
Caddy. About ten minutes end to end.

**The check that counts.**

```text
api.biasmarket.com/api/health  -> {"status":"ok","db":"ok"}
biasmarket.com                 -> 307 /es -> 200, Spanish storefront title
cdn.biasmarket.com             -> 200
Caddy: certificate obtained successfully (all four hostnames, Let's Encrypt)
```

Because Terraform had already moved DNS, Caddy got its certificates seconds
after starting. Order mattered: DNS first, then the service that needs to prove
domain ownership.

**One sharp edge to close immediately.** A fresh Uptime Kuma has no users, so
the first person to open its setup page becomes admin. On a public hostname that
is a race, so create the admin account right after bootstrap.

## Part 10. What is reusable next time

Copy as-is: `versions.tf`, `providers.tf`, `.gitignore`, the `contabo.tf`
skeleton (secret, keys, instance, `templatefile`), the `cloudflare.tf`
`for_each` records pattern, `github.tf`, and the
credentials-file-outside-the-repo habit. Change: domain and subdomain map, the
packages and users in `cloud-init.yaml.tftpl`, the GitHub secret names.

The habits that generalize beyond this stack:

- Import first, then adjust the code until `plan` is empty, before any `apply`.
- Read the provider's docs for every argument that changes: a green "update
  in-place" can be a reinstall.
- `plan` proves you can read, not write. Test writes with a tiny change.
- State is a secret. Local and gitignored is fine to start; keep the import
  blocks until state is shared.
- Terraform makes the infrastructure; a deploy tool ships the app; keep them
  separate, and keep app secrets out of state.
- Rebuilding from scratch is the only real test of a runbook. Every surprise in
  Part 9 was invisible until a fresh server existed.

Still open at the time of writing: backups (Part 11), safer Terraform state
(Part 11), Uptime Kuma monitors, and moving `contabo_firewall` and the
Cloudflare SSL mode under Terraform.

## Part 11. Running it day to day

Everything above builds the thing. This part is the manual for living with it.

### Getting in

```bash
# once: trust the server's host key that Terraform generated
cd infra/terraform && source ~/.config/biasmarket/terraform.env
terraform output -raw known_hosts >> ~/.ssh/known_hosts

ssh root@161.97.113.35                     # admin: your key, no password
sudo -iu deploy bash -l                     # the user the app runs as
```

Password login is off. Root logs in with your key only. `deploy` cannot be
logged into interactively from outside: its two keys are locked to "rsync into
`/opt/biasmarket`" and "run the deploy script", and belong to GitHub Actions.

### Creating and managing admin users

A fresh production database has no admin. Sellers register themselves, admins
are made from the server. You do not need a copy of the repo on the server, and you should not clone one:
the API's admin scripts ship inside the API's Docker image, so the command just
has to run _inside the live container_. Working out which color is live and which
image tag it runs is fiddly, so a wrapper does it. It lives in `infra/vps/bin/`,
which CD already syncs to `/opt/biasmarket/bin/` on every deploy, so it is
automatically there and never a manual step. Run it as root (or `deploy`) from any
directory:

```bash
ssh root@161.97.113.35
/opt/biasmarket/bin/admin.sh create  you@example.com "Your Name"
/opt/biasmarket/bin/admin.sh promote you@example.com
/opt/biasmarket/bin/admin.sh revoke  you@example.com
```

Or in one line from your laptop: `ssh root@161.97.113.35 /opt/biasmarket/bin/admin.sh create you@example.com "Your Name"`.

- It prints a generated password **once**. Copy it, then sign in at
  `https://biasmarket.com/es/login` and open `/es/admin` (users, stores,
  coupons, inquiries). Change the password after the first login at `/es/account`.
- Already registered and just need the role? Use
  `admin.sh promote you@example.com` instead of `create`.
- To remove admin rights: `admin.sh revoke you@example.com` (sets the role back
  to `seller`).
- **Never run `seed:base` on production.** It creates admin accounts with a
  published password. It is for development databases only.

**A trap we fell into while writing this:** the first version of these commands had
`--` before the arguments (`... admin:create -- you@example.com`), which is the
usual way to pass arguments through `pnpm run`. Here it made the script read `--`
as the email, so it would have created an admin account with the email `--`.
Testing the exact command against the real server (with a harmless `promote` on a
nonexistent address) is what caught it: the error read `No user found with email --`.
The lesson is the same as everywhere in this guide: run the documented command
before you trust it.

### Deploying and rolling back

Merge to `main`; CI (with E2E) then CD does the rest. Watch it with
`gh run list --branch main`. On the server:

```bash
sudo -iu deploy bash -lc 'cd /opt/biasmarket && cat state/current_color state/current_sha && tail -5 releases/history.log'
sudo -iu deploy bash -lc 'cd /opt/biasmarket && ./deploy.sh --rollback'   # back to the previous color
docker logs -f biasmarket-api-blue-1                                       # or -green-, whichever is live
```

### Terraform, day to day

```bash
cd infra/terraform && source ~/.config/biasmarket/terraform.env
terraform plan        # read it. Always.
terraform apply
```

Things to remember:

- **The site does not need Terraform or its tokens to keep running.** The
  Cloudflare and Contabo credentials are only used when _you_ run Terraform. If
  the Cloudflare token expires, the website is unaffected; only `terraform plan`
  and `apply` start failing until you make a new token (a one-minute job) and
  put it in `~/.config/biasmarket/terraform.env`. Minimal permission needed:
  Zone, DNS, Edit on `biasmarket.com`.
- Before any `apply`, look for changes to `image_id`, `user_data` or `ssh_keys`
  on the instance. They **reinstall the server and wipe its disk**, and the plan
  calls it "update in-place". `prevent_destroy` does not stop this one.
- Adding a DNS record, a GitHub secret, or a firewall rule is safe and routine.

### The Terraform state file is now worth protecting

`infra/terraform/terraform.tfstate` lives only on your laptop (gitignored). It
records which real resources Terraform owns, and it also holds the generated
private keys (the two deploy keys and the server's host key). Lose it and
Terraform forgets everything, and worse: a fresh state would generate _new_
keys, which changes `user_data`, which the provider treats as a reason to
reinstall the server. That would wipe production, and `prevent_destroy` would
not catch it, because it is an in-place update. So:

- Until remote state exists, keep a private, encrypted copy of
  `terraform.tfstate` somewhere other than this laptop, and refresh it after
  every `apply`.
- The better fix is a remote backend. The Cloudflare R2 credentials mentioned
  earlier are for this and **only** this: R2 would store the Terraform state
  file. It has nothing to do with the app's file storage, which is MinIO on the
  VPS. R2 was suggested simply because it is S3-compatible and free at this
  size. Any private S3-style bucket works. It needs a token with R2 _write_
  access (the earlier one was read-only).

### Backups: there are none yet

Be clear-eyed about this one. Postgres data, MinIO uploads (product images,
payment proofs) and Uptime Kuma all live in Docker volumes on one VPS disk. The
only copies that exist are the pre-migration SQL snapshots `deploy.sh` writes
into `releases/`, and those sit on the same disk. If the VPS is lost, so is the
data.

Cheap steps, roughly in order of effort:

1. Take a Contabo snapshot from the customer panel (your plan includes one).
   Terraform also has a `contabo_instance_snapshot` resource.
2. A nightly `pg_dump` from the `db` container, copied off the server.
3. A nightly mirror of the MinIO buckets (`mc mirror`) to a bucket somewhere
   else. An R2 bucket would be a natural home for 2 and 3.

None of this is implemented yet. It is the most valuable next piece of work.
