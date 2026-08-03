import { Resend } from "resend";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function resolveDriver(): "file" | "resend" {
  const raw = process.env.MAIL_DRIVER;
  if (raw === undefined) return "file";
  if (raw === "file" || raw === "resend") return raw;
  throw new Error(
    `Invalid MAIL_DRIVER: "${raw}". Expected "file" or "resend".`,
  );
}

// apps/api/src/mailer -> apps/api — works whether cwd is apps/api/ (bare
// `pnpm dev`) or the repo root (Docker dev stack).
const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const devMailDir = join(apiRoot, ".mailer-dev");

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

export class MailerCore {
  private readonly driver: "file" | "resend" = resolveDriver();
  private readonly apiKey = requiredEnv("RESEND_API_KEY");
  private readonly fromEmail = requiredEnv("RESEND_FROM_EMAIL");
  private client = new Resend(this.apiKey);

  async send(params: SendEmailParams): Promise<{ id: string }> {
    const from = params.from ?? this.fromEmail;
    return this.driver === "resend"
      ? this.sendViaResend({ ...params, from })
      : this.writeToFile({ ...params, from });
  }

  private async sendViaResend(
    params: SendEmailParams & { from: string },
  ): Promise<{ id: string }> {
    const { data, error } = await this.client.emails.send({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
    });
    if (error) throw new Error(`Resend send failed: ${error.message}`);
    console.log(`[mailer] sent via Resend: ${data?.id} ("${params.subject}")`);
    return { id: data!.id };
  }

  private async writeToFile(
    params: SendEmailParams & { from: string },
  ): Promise<{ id: string }> {
    mkdirSync(devMailDir, { recursive: true });
    const id = randomUUID();
    const to = Array.isArray(params.to) ? params.to.join(", ") : params.to;
    const filePath = join(devMailDir, `${Date.now()}-${id}.html`);
    const header = [
      `<!--`,
      `To: ${to}`,
      `From: ${params.from}`,
      `Subject: ${params.subject}`,
      params.replyTo ? `Reply-To: ${params.replyTo}` : null,
      `-->`,
    ]
      .filter(Boolean)
      .join("\n");
    writeFileSync(filePath, `${header}\n${params.html}`, "utf8");
    console.log(`[mailer] dev mode — wrote "${params.subject}" -> ${filePath}`);
    return { id };
  }
}
