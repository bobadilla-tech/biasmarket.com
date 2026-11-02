type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function mergeMessages<T>(base: T, overlay: DeepPartial<T>): T {
  if (!isRecord(base) || !isRecord(overlay)) return overlay as T;

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const current = result[key];
    result[key] =
      isRecord(current) && isRecord(value)
        ? mergeMessages(current, value)
        : value;
  }
  return result as T;
}
