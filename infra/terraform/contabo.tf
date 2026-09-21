# Phase 2: read-only. `data` blocks let Terraform look things up without owning
# them: nothing here can create, change, or delete anything at Contabo.

data "contabo_image" "os" {
  id = var.contabo_image_id
}

data "contabo_instance" "existing" {
  id = var.contabo_instance_id
}

# Phase 3: the VPS bought by hand through the Contabo checkout, now adopted.
# Arguments mirror what the API reports for it today, so the first plan is empty.
resource "contabo_instance" "main" {
  product_id = "V153" # Cloud VPS 4 (2026)
  region     = "EU"
  image_id   = data.contabo_image.os.id
  period     = 1 # months, matches the 1-month term ordered

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
  }
}
