# Adding count preserves each legacy logical key resource at index zero. These
# moves retain the existing key material in state without regenerating it.
moved {
  from = tls_private_key.deploy_rsync
  to   = tls_private_key.deploy_rsync[0]
}

moved {
  from = tls_private_key.deploy_dispatch
  to   = tls_private_key.deploy_dispatch[0]
}

moved {
  from = tls_private_key.host
  to   = tls_private_key.host[0]
}
