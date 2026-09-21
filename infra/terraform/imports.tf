# One-time adoption of records that already existed in Cloudflare before
# Terraform did. After a successful `apply` the resources live in state and this
# file can be deleted (an import block is only an instruction for the next apply).
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
