# Legacy mode adopts the existing instance through a read-only `data` lookup.
# External mode skips this lookup and creates a new host from a fresh state.

data "contabo_image" "os" {
  id = var.contabo_image_id
}

data "contabo_instance" "existing" {
  count = var.ssh_provisioning_mode == "legacy" ? 1 : 0

  id = var.contabo_instance_id
}

# Phase 4: keys and first-boot configuration.

# The public half of the admin's key, stored at Contabo as a "secret" so
# instances can reference it by ID.
resource "contabo_secret" "admin_ssh" {
  name  = "biasmarket-admin"
  type  = "ssh"
  value = trimspace(var.admin_ssh_public_key)
}

# Legacy-only keys for the already-adopted VPS. The secure new-host path sets
# count to zero and receives public keys from the operator instead.
resource "tls_private_key" "deploy_rsync" {
  count     = var.ssh_provisioning_mode == "legacy" ? 1 : 0
  algorithm = "ED25519"
}

resource "tls_private_key" "deploy_dispatch" {
  count     = var.ssh_provisioning_mode == "legacy" ? 1 : 0
  algorithm = "ED25519"
}

resource "tls_private_key" "host" {
  count     = var.ssh_provisioning_mode == "legacy" ? 1 : 0
  algorithm = "ED25519"
}

locals {
  deploy_public_keys = var.ssh_provisioning_mode == "legacy" ? {
    rsync    = trimspace(tls_private_key.deploy_rsync[0].public_key_openssh)
    dispatch = trimspace(tls_private_key.deploy_dispatch[0].public_key_openssh)
    } : {
    rsync    = trimspace(var.deploy_rsync_public_key)
    dispatch = trimspace(var.deploy_dispatch_public_key)
  }

  cloud_init_variables = merge(
    {
      deploy_rsync_public_key    = local.deploy_public_keys.rsync
      deploy_dispatch_public_key = local.deploy_public_keys.dispatch
      host_private_key           = ""
      host_public_key            = ""
    },
    var.ssh_provisioning_mode == "legacy" ? {
      host_private_key = trimspace(tls_private_key.host[0].private_key_openssh)
      host_public_key  = trimspace(tls_private_key.host[0].public_key_openssh)
    } : {}
  )

  cloud_init_template = var.ssh_provisioning_mode == "legacy" ? (
    "${path.module}/cloud-init.yaml.tftpl"
  ) : "${path.module}/cloud-init.external-ssh.yaml.tftpl"

  user_data = templatefile(local.cloud_init_template, local.cloud_init_variables)
}

# Phase 3: the VPS bought by hand through the Contabo checkout, now adopted.
# Arguments mirror what the API reports for it today, so the first plan is empty.
resource "contabo_instance" "main" {
  product_id = "V153" # Cloud VPS 4 (2026)
  region     = "EU"
  image_id   = data.contabo_image.os.id
  period     = 1 # months, matches the 1-month term ordered

  # Both of these REINSTALL the server when they change (provider behavior).
  ssh_keys  = [tonumber(contabo_secret.admin_ssh.id)]
  user_data = local.user_data

  add_ons {
    id       = 1501
    quantity = 1
  }

  # The Contabo API does not return `period` or `region` when reading an
  # instance, so after an import they are null in state and would show as a
  # perpetual diff. They are kept above as documentation of intent (and for a
  # future create), and ignored afterwards.
  lifecycle {
    ignore_changes = [period, region]

    precondition {
      condition = (
        var.ssh_provisioning_mode == "legacy" && trimspace(var.contabo_instance_id) != ""
      ) || (
        var.ssh_provisioning_mode == "external" && trimspace(var.contabo_instance_id) == ""
      )
      error_message = "Legacy mode must target the adopted VPS. External mode must create a new VPS from a fresh Terraform state."
    }

    precondition {
      condition = var.ssh_provisioning_mode == "legacy" || (
        trimspace(var.deploy_rsync_public_key) != "" && trimspace(var.deploy_dispatch_public_key) != ""
      )
      error_message = "External mode requires both externally generated deploy public keys."
    }

    # A plan that would destroy or replace the production VPS fails instead.
    # To really tear it down, remove this line first (and remember a Contabo
    # destroy schedules cancellation, it does not refund the current term).
    prevent_destroy = true
  }
}

locals {
  # Referenced by DNS (cloudflare.tf) and the GitHub secrets (github.tf), so
  # provisioning a replacement or new VPS re-points both automatically.
  vps_ipv4 = contabo_instance.main.ip_config[0].v4[0].ip
}
