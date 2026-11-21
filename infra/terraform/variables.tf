variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID of biasmarket.com (Dashboard > zone > Overview > API)."
  type        = string
}

variable "contabo_instance_id" {
  description = "Numeric ID of the adopted Contabo VPS in legacy mode; must be empty when provisioning a new host with external SSH keys."
  type        = string
  default     = ""

  validation {
    condition     = trimspace(var.contabo_instance_id) == "" || can(regex("^[0-9]+$", trimspace(var.contabo_instance_id)))
    error_message = "contabo_instance_id must be a numeric ID or empty for a new external-mode host."
  }
}

variable "ssh_provisioning_mode" {
  description = "legacy preserves the currently adopted VPS configuration; external provisions a new VPS with public keys only and out-of-band GitHub credentials. Never switch an existing production state to external."
  type        = string
  default     = "legacy"

  validation {
    condition     = contains(["legacy", "external"], var.ssh_provisioning_mode)
    error_message = "ssh_provisioning_mode must be legacy or external."
  }
}

variable "contabo_image_id" {
  description = "Contabo image UUID for the OS (GET /v1/compute/images?search=ubuntu). Changing it on an existing instance REINSTALLS it."
  type        = string
}

variable "admin_ssh_public_key" {
  description = "Public key (single line) allowed to log in as root on the VPS. Public, not secret."
  type        = string
}

variable "deploy_rsync_public_key" {
  description = "Public half of the externally generated rsync deploy key; required only for new-host external SSH mode."
  type        = string
  default     = ""

  validation {
    condition     = trimspace(var.deploy_rsync_public_key) == "" || can(regex("^ssh-ed25519 [A-Za-z0-9+/]+=*( .*)?$", trimspace(var.deploy_rsync_public_key)))
    error_message = "deploy_rsync_public_key must be an Ed25519 public key or empty."
  }
}

variable "deploy_dispatch_public_key" {
  description = "Public half of the externally generated dispatch deploy key; required only for new-host external SSH mode."
  type        = string
  default     = ""

  validation {
    condition     = trimspace(var.deploy_dispatch_public_key) == "" || can(regex("^ssh-ed25519 [A-Za-z0-9+/]+=*( .*)?$", trimspace(var.deploy_dispatch_public_key)))
    error_message = "deploy_dispatch_public_key must be an Ed25519 public key or empty."
  }
}

variable "web_public_env" {
  description = "NEXT_PUBLIC_* values, stored as repo-level GitHub Actions variables and baked into the web image at build time. Public by design."
  type        = map(string)
}
