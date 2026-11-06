import { ApiError } from "@biasmarket/types";

export type CheckoutError =
  | { kind: "connection" }
  | { kind: "mismatch" }
  | { kind: "expired" }
  | { kind: "validation"; message: string }
  | { kind: "failed" };

export function mapCheckoutError(error: unknown): CheckoutError {
  if (error instanceof ApiError) {
    if (error.status === 410) return { kind: "expired" };
    if (error.status === 409) return { kind: "mismatch" };
    if (error.status === 400) {
      return { kind: "validation", message: error.message };
    }
  }

  if (
    error instanceof TypeError ||
    (error instanceof Error && error.name === "AbortError")
  ) {
    return { kind: "connection" };
  }
  return { kind: "failed" };
}

export function shouldClearCheckoutIdempotencyKey(
  error: CheckoutError,
): boolean {
  return error.kind === "mismatch" || error.kind === "expired";
}
