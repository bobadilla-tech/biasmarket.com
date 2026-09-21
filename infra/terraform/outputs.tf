output "image_name" {
  description = "OS image the instance should run."
  value       = data.contabo_image.os.name
}

output "existing_instance" {
  description = "What Contabo reports about the VPS right now (read-only lookup)."
  value = {
    id         = data.contabo_instance.existing.id
    product_id = data.contabo_instance.existing.product_id
    image_id   = data.contabo_instance.existing.image_id
    status     = data.contabo_instance.existing.status
    ipv4       = data.contabo_instance.existing.ip_config[0].v4[0].ip
    add_ons    = data.contabo_instance.existing.add_ons
  }
}

output "ssh_command" {
  description = "Log in as the admin."
  value       = "ssh root@${data.contabo_instance.existing.ip_config[0].v4[0].ip}"
}

output "known_hosts" {
  description = "Pinned host key line, becomes the DEPLOY_SSH_KNOWN_HOSTS GitHub secret."
  value       = "${data.contabo_instance.existing.ip_config[0].v4[0].ip} ${trimspace(tls_private_key.host.public_key_openssh)}"
}
