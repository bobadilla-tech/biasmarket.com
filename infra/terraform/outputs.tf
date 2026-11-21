output "image_name" {
  description = "OS image the instance should run."
  value       = data.contabo_image.os.name
}

output "existing_instance" {
  description = "What Contabo reports about the VPS right now (read-only lookup)."
  value = var.ssh_provisioning_mode == "legacy" ? {
    id         = data.contabo_instance.existing[0].id
    product_id = data.contabo_instance.existing[0].product_id
    image_id   = data.contabo_instance.existing[0].image_id
    status     = data.contabo_instance.existing[0].status
    ipv4       = data.contabo_instance.existing[0].ip_config[0].v4[0].ip
    add_ons    = data.contabo_instance.existing[0].add_ons
  } : null
}

output "ssh_command" {
  description = "Log in as the admin after the host is created."
  value       = "ssh root@${contabo_instance.main.ip_config[0].v4[0].ip}"
}

output "known_hosts" {
  description = "Legacy Terraform-managed host-key pin. External mode must obtain and verify the key through the provider console."
  value = var.ssh_provisioning_mode == "legacy" ? (
    "${contabo_instance.main.ip_config[0].v4[0].ip} ${trimspace(tls_private_key.host[0].public_key_openssh)}"
  ) : null
}
