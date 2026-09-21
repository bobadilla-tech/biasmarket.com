# Empty on purpose: the provider reads its credentials from the environment
# (see ~/.config/biasmarket/terraform.env), so nothing secret ever lands in a
# .tf file, a plan, or git.
#
#   CNTB_OAUTH2_CLIENT_ID      CNTB_OAUTH2_CLIENT_SECRET
#   CNTB_OAUTH2_USER (email)   CNTB_OAUTH2_PASS (API password, not login)
provider "contabo" {}

# Reads CLOUDFLARE_API_TOKEN from the environment.
provider "cloudflare" {}
