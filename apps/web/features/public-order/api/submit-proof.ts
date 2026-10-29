import { ApiError } from "@biasmarket/types";
import { publicApiBase } from "../lib/shipping-links";
import type { SubmitProofInput } from "../schemas/submit-proof.schema";

// Multipart carve-out (see apps/web/AGENTS.md): the generated client has no
// FormData support. Browser-side, same host as the page's GET, no cookies
// (the token is the only credential) and NO custom headers: any extra header
// would force a CORS preflight that the API's `allowedHeaders` rejects.
export async function submitProof(
  token: string,
  values: SubmitProofInput,
  fallbackErrorMessage?: string,
): Promise<{ id: string }> {
  const body = new FormData();
  body.append("amount", values.amount);
  body.append("method", values.method);
  if (values.operationCode.trim()) {
    body.append("operationCode", values.operationCode.trim());
  }
  if (values.file) body.append("file", values.file);

  const res = await fetch(
    `${publicApiBase()}/api/public/orders/${encodeURIComponent(token)}/payments`,
    { method: "POST", credentials: "omit", body },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // The API's `message` can be a string or (validation errors) a list.
    const message = Array.isArray(data?.message)
      ? data.message.join(", ")
      : data?.message;
    throw new ApiError(
      typeof message === "string" && message
        ? message
        : (fallbackErrorMessage ?? "Network error"),
      res.status,
    );
  }
  return data as { id: string };
}
