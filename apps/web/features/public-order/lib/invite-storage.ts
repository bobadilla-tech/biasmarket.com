// Per-browser memory of the invitation state, keyed by store slug + order
// number (never the token). Best effort: Safari private mode and in-app
// WebViews can throw or reset storage, so every access is guarded and falls
// back to memory for the current page load.
const PREFIX = "bm-invite";
const memory = new Map<string, string>();

function key(slug: string, orderNumber: string, name: string): string {
  return `${PREFIX}:${slug}:${orderNumber}:${name}`;
}

function read(storageKey: string): string | null {
  try {
    return (
      window.localStorage.getItem(storageKey) ?? memory.get(storageKey) ?? null
    );
  } catch {
    return memory.get(storageKey) ?? null;
  }
}

function write(storageKey: string, value: string): void {
  memory.set(storageKey, value);
  try {
    window.localStorage.setItem(storageKey, value);
  } catch {
    // Memory fallback above is all we have.
  }
}

export const inviteStorage = {
  getFirstSeen: (slug: string, orderNumber: string): boolean =>
    read(key(slug, orderNumber, "firstSeen")) === "1",
  setFirstSeen: (slug: string, orderNumber: string): void =>
    write(key(slug, orderNumber, "firstSeen"), "1"),
  getDismissedAt: (slug: string, orderNumber: string): number | null => {
    const raw = read(key(slug, orderNumber, "dismissedAt"));
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  },
  setDismissedAt: (slug: string, orderNumber: string, at: number): void =>
    write(key(slug, orderNumber, "dismissedAt"), String(at)),
  // Test hook: forget the in-memory fallback.
  clearMemory: (): void => memory.clear(),
};
