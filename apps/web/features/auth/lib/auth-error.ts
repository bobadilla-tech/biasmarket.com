// better-auth reports OAuth failures as `?error=<code>` on the error URL. The
// raw code is never shown to people — each one is folded into a screen kind
// with its own explanation, and anything unrecognised becomes `generic`.
export type AuthErrorKind =
  "existingAccount" | "cancelled" | "expired" | "googleProblem" | "generic";

const CODE_TO_KIND: Record<string, AuthErrorKind> = {
  account_not_linked: "existingAccount",
  access_denied: "cancelled",
  state_mismatch: "expired",
  invalid_state: "expired",
  state_not_found: "expired",
  please_restart_the_process: "expired",
  no_code: "expired",
  invalid_code: "expired",
  unable_to_link_account: "googleProblem",
  email_not_found: "googleProblem",
  email_missing: "googleProblem",
  signup_disabled: "googleProblem",
  oauth_provider_not_found: "googleProblem",
};

export function classifyAuthError(
  code: string | null | undefined,
): AuthErrorKind {
  const normalized = (code ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(/[\s-]+/g, "_");
  return CODE_TO_KIND[normalized] ?? "generic";
}
