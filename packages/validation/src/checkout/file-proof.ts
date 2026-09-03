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
export const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "application/pdf"];
export const ACCEPTED_EXTENSION = /\.(jpe?g|png|pdf)$/i;

export function isValidProofFile(file: ProofFileLike): boolean {
  return (
    (file.type !== undefined && ACCEPTED_MIME_TYPES.includes(file.type)) ||
    ACCEPTED_EXTENSION.test(file.name)
  );
}

export function isProofFileLike(value: unknown): value is ProofFileLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof (value as { name: unknown }).name === "string" &&
    (value as { type?: unknown }).type !== undefined &&
    typeof (value as { type?: unknown }).type === "string" &&
    "size" in value &&
    typeof (value as { size: unknown }).size === "number"
  );
}

export function isAllowedProof(v: unknown): v is ProofFileLike | null | undefined {
  return v == null || isProofFileLike(v);
}
