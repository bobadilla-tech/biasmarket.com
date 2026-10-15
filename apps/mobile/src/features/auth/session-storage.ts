import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "biasmarket.buyer-session.v1";

export interface StoredBuyerSession {
  token: string;
  storeSlug: string;
}

export async function readBuyerSession(): Promise<StoredBuyerSession | null> {
  const value = await SecureStore.getItemAsync(SESSION_KEY);
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (
      parsed &&
      typeof parsed === "object" &&
      "token" in parsed &&
      typeof parsed.token === "string" &&
      parsed.token.length > 0 &&
      "storeSlug" in parsed &&
      typeof parsed.storeSlug === "string" &&
      parsed.storeSlug.length > 0
    ) {
      return { token: parsed.token, storeSlug: parsed.storeSlug };
    }
  } catch {
    // Treat corrupted local state as a signed-out session.
  }

  await SecureStore.deleteItemAsync(SESSION_KEY);
  return null;
}

export async function writeBuyerSession(
  session: StoredBuyerSession,
): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function deleteBuyerSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
