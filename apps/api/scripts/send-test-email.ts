#!/usr/bin/env node

// One-off smoke test for the mailer — confirms env vars are wired and,
// in `resend` driver mode, that a real send round-trips through Resend's
// API. In `file` driver mode (the default), just confirms the dev
// file-drop path works — check apps/api/.mailer-dev/ after running.
// Usage: pnpm --filter api run mail:test <to-email>

import "dotenv/config";
import { MailerCore } from "../src/mailer/mailer.core.ts";

const to = process.argv[2];

if (!to) {
  console.error("Usage: node scripts/send-test-email.ts <to-email>");
  process.exit(1);
}

const mailer = new MailerCore();

await mailer.send({
  to,
  subject: "Bias Market — mailer smoke test",
  html: "<p>If you can read this, the mailer works.</p>",
});
