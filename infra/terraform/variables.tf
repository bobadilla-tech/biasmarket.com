variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID of biasmarket.com (Dashboard > zone > Overview > API)."
  type        = string
}

variable "origin_ip" {
  description = "IPv4 the four app A records point to. Temporary: replaced by a reference to the Contabo instance once it is under Terraform."
  type        = string
}
