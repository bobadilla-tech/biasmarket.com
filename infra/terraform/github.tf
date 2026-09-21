# Phase 7: the GitHub `production` environment that cd.yml and
# cleanup-fallback.yml read their deploy credentials from. Replaces step 6 of
# the VPS provisioning section in docs/core/blue-green-migrations.md.

locals {
  github_repo = "biasmarket.com"

  vps_ipv4 = contabo_instance.main.ip_config[0].v4[0].ip

  # Values for the environment secrets. Derived from sensitive values (private
  # keys), so this map cannot be iterated directly, see the for_each below.
  deploy_secret_values = {
    DEPLOY_SSH_HOST         = local.vps_ipv4
    DEPLOY_SSH_USER         = "deploy"
    DEPLOY_SSH_KNOWN_HOSTS  = "${local.vps_ipv4} ${trimspace(tls_private_key.host.public_key_openssh)}"
    DEPLOY_SSH_KEY_RSYNC    = tls_private_key.deploy_rsync.private_key_openssh
    DEPLOY_SSH_KEY_DISPATCH = tls_private_key.deploy_dispatch.private_key_openssh
  }
}

resource "github_repository_environment" "production" {
  repository  = local.github_repo
  environment = "production"
}

# for_each cannot use a sensitive collection, so loop over the (non-secret)
# names and index into the sensitive map inside the block.
resource "github_actions_environment_secret" "deploy" {
  for_each = toset([
    "DEPLOY_SSH_HOST",
    "DEPLOY_SSH_USER",
    "DEPLOY_SSH_KNOWN_HOSTS",
    "DEPLOY_SSH_KEY_RSYNC",
    "DEPLOY_SSH_KEY_DISPATCH",
  ])

  repository      = local.github_repo
  environment     = github_repository_environment.production.environment
  secret_name     = each.value
  plaintext_value = local.deploy_secret_values[each.value]
}

# Public build-time values baked into the web image (see cd.yml build-args).
resource "github_actions_variable" "web_public" {
  for_each = var.web_public_env

  repository    = local.github_repo
  variable_name = each.key
  value         = each.value
}
