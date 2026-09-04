/**
 * RN-safe proof-of-payment file shape.
 *
 * The browser `File` global doesn't exist in React Native, so proof files are
 * validated structurally instead of via `instanceof File`. Web still passes a
 * real `File` (which satisfies this shape: `name`, `type`, `size`); React
 * Native passes an image-picker asset (`{ uri, name, type?, size }`). `type`
 * is optional because pickers may leave it blank — type checks then fall back
 * to the filename extension.
 */
export interface ProofFileLike {
  name: string;
  type?: string;
  size: number;
}

export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
];
export const ACCEPTED_EXTENSION = /\.(jpe?g|png|pdf)$/i;

export function isValidProofFile(file: ProofFileLike): boolean {
  // When a MIME type is present (and non-blank) it must be accepted; the
  // filename-extension fallback is only for pickers that leave `type` empty.
  if (file.type !== undefined && file.type !== "") {
    return ACCEPTED_MIME_TYPES.includes(file.type);
  }
  return ACCEPTED_EXTENSION.test(file.name);
}

export function isProofFileLike(value: unknown): value is ProofFileLike {
  if (
    typeof value !== "object" ||
    value === null ||
    !("name" in value) ||
    typeof (value as { name: unknown }).name !== "string" ||
    !("size" in value) ||
    typeof (value as { size: unknown }).size !== "number"
  ) {
    return false;
  }
  // `type` is optional and may be blank — only reject it when present and not a
  // string (e.g. `{ type: 42 }` is not a valid ProofFileLike).
  const type = (value as { type?: unknown }).type;
  return type === undefined || typeof type === "string";
}

export function isAllowedProof(
  v: unknown,
): v is ProofFileLike | null | undefined {
  return v == null || isProofFileLike(v);
}
