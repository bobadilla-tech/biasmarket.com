"""Static safety checks for Terraform's new-host external SSH mode."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ExternalSshModeTests(unittest.TestCase):
    def test_external_cloud_init_contains_only_public_deploy_keys(self):
        template = (ROOT / "cloud-init.external-ssh.yaml.tftpl").read_text()

        self.assertIn("ssh_deletekeys: true", template)
        self.assertIn("ssh_genkeytypes: [ed25519]", template)
        self.assertIn("${deploy_rsync_public_key}", template)
        self.assertIn("${deploy_dispatch_public_key}", template)
        self.assertNotIn("${host_private_key}", template)
        self.assertNotIn("ed25519_private", template)
        self.assertNotIn("${deploy_rsync_private_key}", template)
        self.assertNotIn("${deploy_dispatch_private_key}", template)

    def test_terraform_private_keys_are_legacy_only_and_state_moves_are_declared(self):
        config = (ROOT / "contabo.tf").read_text()
        moved = (ROOT / "moved.tf").read_text()

        self.assertEqual(config.count('count     = var.ssh_provisioning_mode == "legacy" ? 1 : 0'), 3)
        self.assertIn('cloud_init_template = var.ssh_provisioning_mode == "legacy" ?', config)
        self.assertIn('"${path.module}/cloud-init.yaml.tftpl"', config)
        self.assertIn('"${path.module}/cloud-init.external-ssh.yaml.tftpl"', config)
        self.assertIn("from = tls_private_key.deploy_rsync", moved)
        self.assertIn("from = tls_private_key.deploy_dispatch", moved)
        self.assertIn("from = tls_private_key.host", moved)
        self.assertIn("prevent_destroy = true", config)

    def test_external_mode_does_not_manage_deploy_secrets_in_terraform(self):
        github = (ROOT / "github.tf").read_text()

        self.assertIn('var.ssh_provisioning_mode == "legacy" ? toset([', github)
        self.assertIn(']) : toset([])', github)
        self.assertIn("for_each = local.deploy_secret_names", github)

    def test_out_of_band_upload_reads_private_keys_from_files(self):
        script = (ROOT / "scripts/external-ssh-credentials.sh").read_text()

        self.assertIn('gh secret set DEPLOY_SSH_KEY_RSYNC --repo "$GH_REPO" --env production <"$RSYNC_KEY"', script)
        self.assertIn('gh secret set DEPLOY_SSH_KEY_DISPATCH --repo "$GH_REPO" --env production <"$DISPATCH_KEY"', script)
        self.assertNotIn("private_key_openssh", script)


if __name__ == "__main__":
    unittest.main()
