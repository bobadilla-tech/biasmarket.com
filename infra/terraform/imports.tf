# Adoption of resources that existed before Terraform did (the VPS, the
# Cloudflare records, the GitHub environment and variables).
#
# KEEP THIS FILE while state is local and gitignored: a fresh clone has no
# state, and without these blocks `terraform plan` would propose CREATING a
# second VPS (and a second bill) and duplicate DNS records. Import blocks are
# harmless once a resource is in state. Delete this file only after state has
# moved to a shared remote backend that already contains these resources.
#
# Record IDs come from: GET /zones/<zone_id>/dns_records?type=A
locals {
  app_record_ids = {
    root   = "616fd5076a7f16d6d33cfa4545418bf3"
    api    = "a4620f347f3f55da98910e8593e4a8ce"
    cdn    = "178186bea194666a4747d61e72da2ff0"
    status = "82008c3fa1e7d02fa863ea69c8376974"
  }
}

import {
  for_each = local.app_record_ids

  to = cloudflare_dns_record.app[each.key]
  id = "${var.cloudflare_zone_id}/${each.value}"
}

import {
  to = contabo_instance.main
  id = var.contabo_instance_id
}

# The GitHub `production` environment and the NEXT_PUBLIC_* variables were
# created by hand before Terraform. Import format: <repository>:<name>.
# (Environment secrets cannot be imported: GitHub never returns their values,
# so Terraform just writes them.)
import {
  to = github_repository_environment.production
  id = "biasmarket.com:production"
}

import {
  for_each = var.web_public_env

  to = github_actions_variable.web_public[each.key]
  id = "biasmarket.com:${each.key}"
}
