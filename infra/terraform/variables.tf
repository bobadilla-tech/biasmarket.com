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
