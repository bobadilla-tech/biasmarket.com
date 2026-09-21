# The four hostnames served by the Caddy on the VPS (see infra/vps/Caddyfile).
# Other records in the zone (blog on Vercel, Resend/SES email records, Google
# verification) are deliberately NOT managed here.

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
  ttl     = 1 # 1 = "automatic" (required when proxied)
  proxied = true
}
