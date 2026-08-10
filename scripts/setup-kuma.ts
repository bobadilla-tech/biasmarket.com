// Configures Uptime Kuma (monitors, the durable-history webhook notification,
// and the public status page) entirely over its Socket.IO admin API — Kuma
// has no REST/config-file admin surface, everything its own web UI does goes
// over this same socket connection. Contract confirmed against the pinned
// `louislam/uptime-kuma:1.23.16` server source (server/server.js,
// server/notification-providers/webhook.js,
// server/socket-handlers/status-page-socket-handler.js).
//
// Idempotent: re-running skips monitors/the notification that already exist
// by name, and re-saves the status page (safe to update repeatedly).
//
// Usage (run on the VM, from the repo root, after `pnpm docker:prod` has
// brought `uptime-kuma` up):
//   KUMA_USERNAME=admin KUMA_PASSWORD=... node scripts/setup-kuma.ts
//
// Env vars:
//   KUMA_URL       default https://status.biasmarket.com
//   KUMA_USERNAME  required — also used to create the first admin account if
//                  Kuma's setup wizard hasn't run yet (needSetup === true)
//   KUMA_PASSWORD  required, same as above
//   API_URL        default https://api.biasmarket.com — where the durable-
//                  history webhook notification posts to
//   MONITORING_WEBHOOK_SECRET  read from infra/docker/.env if not set in the
//                  environment (the same file `api` itself reads on boot)
//   STATUS_PAGE_SLUG   default "status"
//   STATUS_PAGE_TITLE  default "Bias Market Status"
//
// Does NOT configure a real-time Slack/Discord notification — deliberately
// out of scope here per the plan's alerting split (see
// docs/plans/2026-08-09-uptime-kuma-monitoring-plan.md and
// docs/core/incident-response.md); add one by hand in the Kuma UI (Settings →
// Notifications) and attach it to the same 6 monitors when you have a
// webhook URL for it, or extend this script with another addNotification
// call using the same pattern as the webhook one below.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { io } from "socket.io-client";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// PNG export of apps/web/app/favicon.ico (Kuma's status-page logo upload
// only accepts PNG — see saveStatusPage below). Regenerate if the site
// favicon changes: `sips -s format png apps/web/app/favicon.ico --out
// scripts/assets/kuma-status-page-favicon.png` (macOS) or an equivalent
// ImageMagick/ffmpeg call elsewhere.
const statusPageLogoDataUrl = `data:image/png;base64,${
  readFileSync(
    join(repoRoot, "scripts", "assets", "kuma-status-page-favicon.png"),
  ).toString("base64")
}`;

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (match) out[match[1]] = match[2];
  }
  return out;
}

const dockerEnv = parseEnvFile(join(repoRoot, "infra", "docker", ".env"));

function requiredEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const KUMA_URL = process.env.KUMA_URL ?? "https://status.biasmarket.com";
const KUMA_USERNAME = requiredEnv("KUMA_USERNAME");
const KUMA_PASSWORD = requiredEnv("KUMA_PASSWORD");
const API_URL = process.env.API_URL ?? "https://api.biasmarket.com";
const MONITORING_WEBHOOK_SECRET = requiredEnv(
  "MONITORING_WEBHOOK_SECRET",
  dockerEnv.MONITORING_WEBHOOK_SECRET,
);
const STATUS_PAGE_SLUG = process.env.STATUS_PAGE_SLUG ?? "status";
const STATUS_PAGE_TITLE = process.env.STATUS_PAGE_TITLE ??
  "Bias Market Status";

const NOTIFICATION_NAME = "api-monitoring-webhook";

interface HttpMonitorSpec {
  type: "http";
  name: string;
  url: string;
  external: boolean;
}
interface PortMonitorSpec {
  type: "port";
  name: string;
  hostname: string;
  port: number;
  external: boolean;
}
type MonitorSpec = HttpMonitorSpec | PortMonitorSpec;

// Mirrors the 6-monitor table in
// docs/plans/2026-08-09-uptime-kuma-monitoring-plan.md — external/internal
// pairs isolate the fault domain (Caddy/DNS/TLS vs. the app itself) on the
// first alert instead of requiring a second manual check. Only the two
// `external: true` monitors go on the public status page.
const MONITORS: MonitorSpec[] = [
  {
    type: "http",
    name: "API (external)",
    url: `${API_URL}/api/health`,
    external: true,
  },
  {
    type: "http",
    name: "API (internal)",
    url: "http://api:3000/api/health",
    external: false,
  },
  {
    type: "http",
    name: "Web (external)",
    url: "https://biasmarket.com/api/health",
    external: true,
  },
  {
    type: "http",
    name: "Web (internal)",
    url: "http://web:3001/api/health",
    external: false,
  },
  { type: "port", name: "DB", hostname: "db", port: 5432, external: false },
  {
    type: "http",
    name: "MinIO",
    url: "http://minio:9000/minio/health/live",
    external: false,
  },
];

// Kuma's socket.io ack payloads aren't typed anywhere upstream — `any` here,
// narrowed at each call site via the Promise's own type parameter.
type Cb = (res: any) => void;

async function main() {
  console.log(`Connecting to ${KUMA_URL} ...`);
  const socket = io(KUMA_URL, { transports: ["websocket", "polling"] });

  const existingMonitors = new Map<string, number>();
  const existingNotifications = new Map<string, number>();

  // Kuma pushes these automatically after a successful login (its own UI's
  // state-sync mechanism) — not a request/response call.
  socket.on("monitorList", (list: Record<string, { id: number; name: string }>) => {
    for (const m of Object.values(list)) existingMonitors.set(m.name, m.id);
  });
  socket.on(
    "notificationList",
    (list: Array<{ id: number; name: string }>) => {
      for (const n of list) existingNotifications.set(n.name, n.id);
    },
  );

  await new Promise<void>((resolve, reject) => {
    socket.on("connect_error", reject);
    socket.on("connect", () => resolve());
  });
  console.log("Connected.");

  const needsSetup = await new Promise<boolean>((resolve) =>
    socket.emit("needSetup", (res: boolean) => resolve(res))
  );

  if (needsSetup) {
    console.log("No admin account yet — creating one from KUMA_USERNAME/KUMA_PASSWORD ...");
    const setupRes = await new Promise<{ ok: boolean; msg?: string }>(
      (resolve) =>
        socket.emit("setup", KUMA_USERNAME, KUMA_PASSWORD, resolve as Cb),
    );
    if (!setupRes.ok) throw new Error(`Kuma setup failed: ${setupRes.msg}`);
  }

  const loginRes = await new Promise<{ ok: boolean; msg?: string }>(
    (resolve) =>
      socket.emit(
        "login",
        { username: KUMA_USERNAME, password: KUMA_PASSWORD },
        resolve as Cb,
      ),
  );
  if (!loginRes.ok) throw new Error(`Kuma login failed: ${loginRes.msg}`);
  console.log("Logged in.");

  // Give the post-login monitorList/notificationList pushes a moment to
  // arrive before reading existingMonitors/existingNotifications.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  let notificationId = existingNotifications.get(NOTIFICATION_NAME);
  if (notificationId) {
    console.log(`Notification "${NOTIFICATION_NAME}" already exists (id ${notificationId}), reusing.`);
  } else {
    const notification = {
      name: NOTIFICATION_NAME,
      type: "webhook",
      isDefault: false,
      applyExisting: false,
      webhookURL: `${API_URL}/api/monitoring/webhook`,
      webhookContentType: "json",
      webhookAdditionalHeaders: JSON.stringify({
        "X-Webhook-Secret": MONITORING_WEBHOOK_SECRET,
      }),
    };
    const res = await new Promise<{ ok: boolean; msg?: string; id: number }>(
      (resolve) => socket.emit("addNotification", notification, null, resolve as Cb),
    );
    if (!res.ok) throw new Error(`addNotification failed: ${res.msg}`);
    notificationId = res.id;
    console.log(`Created notification "${NOTIFICATION_NAME}" (id ${notificationId}).`);
  }

  const monitorIds = new Map<string, number>();
  for (const spec of MONITORS) {
    const existingId = existingMonitors.get(spec.name);
    if (existingId) {
      console.log(`Monitor "${spec.name}" already exists (id ${existingId}), skipping.`);
      monitorIds.set(spec.name, existingId);
      continue;
    }

    const base = {
      name: spec.name,
      interval: 60,
      retryInterval: 60,
      resendInterval: 0,
      maxretries: 3,
      timeout: 48,
      notificationIDList: { [notificationId]: true },
      active: true,
      upsideDown: false,
    };
    const monitor = spec.type === "http"
      ? {
        ...base,
        type: "http",
        url: spec.url,
        method: "GET",
        accepted_statuscodes: ["200-299"],
      }
      : {
        ...base,
        type: "port",
        hostname: spec.hostname,
        port: spec.port,
        // Server-side validation reads accepted_statuscodes unconditionally
        // (Array.prototype.every) regardless of monitor type — unused for a
        // TCP check but required to be present or `add` throws.
        accepted_statuscodes: ["200-299"],
      };

    const res = await new Promise<
      { ok: boolean; msg?: string; monitorID: number }
    >((resolve) => socket.emit("add", monitor, resolve as Cb));
    if (!res.ok) throw new Error(`add monitor "${spec.name}" failed: ${res.msg}`);
    monitorIds.set(spec.name, res.monitorID);
    console.log(`Created monitor "${spec.name}" (id ${res.monitorID}).`);
  }

  console.log(`Setting up public status page "${STATUS_PAGE_SLUG}" ...`);
  const existingPage = await new Promise<{ ok: boolean; config?: unknown }>(
    (resolve) => socket.emit("getStatusPage", STATUS_PAGE_SLUG, resolve as Cb),
  );
  if (!existingPage.ok) {
    const created = await new Promise<{ ok: boolean; msg?: string }>(
      (resolve) =>
        socket.emit(
          "addStatusPage",
          STATUS_PAGE_TITLE,
          STATUS_PAGE_SLUG,
          resolve as Cb,
        ),
    );
    if (!created.ok) {
      throw new Error(`addStatusPage failed: ${created.msg}`);
    }
  }

  // Only the two external, user-facing monitors go on the public page — the
  // other four stay internal-triage-only, per the plan's status page design.
  const publicGroupList = [
    {
      name: "Services",
      weight: 1,
      monitorList: MONITORS.filter((m) => m.external).map((m) => ({
        id: monitorIds.get(m.name),
      })),
    },
  ];

  const saveRes = await new Promise<{ ok: boolean; msg?: string }>(
    (resolve) =>
      socket.emit(
        "saveStatusPage",
        STATUS_PAGE_SLUG,
        {
          slug: STATUS_PAGE_SLUG,
          title: STATUS_PAGE_TITLE,
          description: "",
          theme: "auto",
          showTags: false,
          footerText: "",
          showPoweredBy: false,
          showCertificateExpiry: false,
          domainNameList: [],
        },
        statusPageLogoDataUrl,
        publicGroupList,
        resolve as Cb,
      ),
  );
  if (!saveRes.ok) throw new Error(`saveStatusPage failed: ${saveRes.msg}`);
  console.log(
    `Status page ready at ${KUMA_URL}/ (Caddy rewrites root to /status/${STATUS_PAGE_SLUG})`,
  );

  socket.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
