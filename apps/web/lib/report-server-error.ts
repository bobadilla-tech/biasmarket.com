// Server-only: reports an error to Sentry (GlitchTip) and degrades gracefully,
// but rethrows Next's own control-flow signals (dynamic rendering bailout,
// notFound()/redirect()) instead of swallowing them. Dynamic-imports
// @sentry/node, matching instrumentation.ts's convention, so this stays safe
// to import from code that could theoretically run in the Edge runtime.
function isNextControlFlowError(error: unknown): boolean {
  const digest = (error as { digest?: string } | null | undefined)?.digest;
  if (!digest) return false;
  return digest === "DYNAMIC_SERVER_USAGE" ||
    digest.startsWith("NEXT_HTTP_ERROR_FALLBACK");
}

export async function reportServerError(
  error: unknown,
  extra: Record<string, unknown>,
): Promise<void> {
  if (isNextControlFlowError(error)) throw error;

  const Sentry = await import("@sentry/node");
  Sentry.captureException(error, { extra });
}
