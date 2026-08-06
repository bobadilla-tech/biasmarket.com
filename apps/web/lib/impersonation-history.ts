const STORAGE_KEY = "biasmarket:impersonation-history";

export interface ImpersonationHistory {
  userId: string;
  path: string;
  active: boolean;
}

export function getImpersonationHistory(): ImpersonationHistory | null {
  if (typeof window === "undefined") return null;

  try {
    const value: unknown = JSON.parse(
      globalThis.sessionStorage.getItem(STORAGE_KEY) ?? "null",
    );
    if (!value || typeof value !== "object") return null;
    const entry = value as Partial<ImpersonationHistory>;
    if (
      typeof entry.userId !== "string" ||
      typeof entry.path !== "string" ||
      typeof entry.active !== "boolean"
    ) {
      return null;
    }
    return entry as ImpersonationHistory;
  } catch {
    return null;
  }
}

export function setImpersonationHistory(
  value: ImpersonationHistory,
): void {
  globalThis.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function clearImpersonationHistory(): void {
  globalThis.sessionStorage.removeItem(STORAGE_KEY);
}
