// Shared by apps/api and apps/workers: decides which log lines are forwarded
// to GlitchTip. Structurally typed on purpose (like ../sentry-scrub) so it
// needs no Sentry dependency.

// Nest's own boot chatter (one line per module, route and mapping, 100+ per
// container start). Useful on a local console, noise in the searchable store,
// so it stays in stdout only.
export const FRAMEWORK_LOG_CONTEXTS: ReadonlySet<string> = new Set([
  "InstanceLoader",
  "RoutesResolver",
  "RouterExplorer",
  "NestFactory",
  "NestApplication",
]);

// `attributes.context` is a plain value or a `{ value, type }` wrapper
// depending on where in the SDK the log is seen.
export function isFrameworkLog(log: object): boolean {
  const context = (log as { attributes?: Record<string, unknown> }).attributes
    ?.context;
  const name =
    typeof context === "object" && context !== null
      ? (context as { value?: unknown }).value
      : context;
  return typeof name === "string" && FRAMEWORK_LOG_CONTEXTS.has(name);
}
