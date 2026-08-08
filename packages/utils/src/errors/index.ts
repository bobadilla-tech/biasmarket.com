export function extractMessage(response: string | object): string {
  if (typeof response === "string") return response;

  if (
    typeof response === "object" &&
    response !== null &&
    "message" in response
  ) {
    const msg = (response as { message: unknown }).message;
    return Array.isArray(msg) ? msg.join(", ") : String(msg);
  }

  return "Unknown error";
}

export function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return "[Unserializable object error]";
    }
  }

  return String(error);
}
