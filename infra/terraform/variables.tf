variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID of biasmarket.com (Dashboard > zone > Overview > API)."
  type        = string
}

variable "origin_ip" {
  description = "IPv4 the four app A records point to. Temporary: replaced by a reference to the Contabo instance once it is under Terraform."
  type        = string
}

variable "contabo_instance_id" {
  description = "Numeric ID of the Contabo VPS (Customer panel > VPS, or GET /v1/compute/instances)."
  type        = string
}

variable "contabo_image_id" {
  description = "Contabo image UUID for the OS (GET /v1/compute/images?search=ubuntu). Changing it on an existing instance REINSTALLS it."
  type        = string
}

variable "admin_ssh_public_key" {
  description = "Public key (single line) allowed to log in as root on the VPS. Public, not secret."
  type        = string
}

variable "web_public_env" {
  description = "NEXT_PUBLIC_* values, stored as repo-level GitHub Actions variables and baked into the web image at build time. Public by design."
  type        = map(string)
}
