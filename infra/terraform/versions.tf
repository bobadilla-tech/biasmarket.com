terraform {
  # `import {}` blocks need >= 1.5, `for_each` on them needs >= 1.7.
  required_version = ">= 1.7"

  required_providers {
    contabo = {
      source  = "contabo/contabo"
      version = "~> 0.1.44"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}
