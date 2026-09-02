export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
];
export const ACCEPTED_EXTENSION = /\.(jpe?g|png|pdf)$/i;

/**
 * Structural file shape for proof-of-payment uploads, shared by web and
 * mobile. Plain object shapes are required so the same schemas run under
 * React Native, where the browser `File` type does not exist: web still
 * passes a real `File` (name/type/size overlap this shape) and mobile passes
 * an expo-image-picker asset ({ uri, name, type, size }); the schemas only
 * declare the fields they actually read and validate. `isValidProofFile`
 * narrows a value to `ProofFileShape`.
 */
export interface ProofFileShape {
  name?: string;
  type?: string;
  size?: number;
  uri?: string;
}

export function isValidProofFile(file: ProofFileShape): boolean {
  return (
    (!!file.type && ACCEPTED_MIME_TYPES.includes(file.type)) ||
    (!!file.name && ACCEPTED_EXTENSION.test(file.name))
  );
}

/**
 * Zod `.custom()` predicate for `ProofFileShape`: accepts only non-null
 * objects whose present optional fields are well-typed. Rejects primitives
 * like `false`, `0`, `""` that would otherwise slip past a `!file ||`
 * refinement guard. Real `File`s and expo-image-picker assets both satisfy
 * the shape.
 */
export function isProofFileShape(value: unknown): value is ProofFileShape {
  if (value === null || typeof value !== "object") return false;
  const file = value as Record<string, unknown>;
  if ("name" in file && typeof file.name !== "string") return false;
  if ("type" in file && typeof file.type !== "string") return false;
  if ("size" in file && (typeof file.size !== "number" || !Number.isFinite(file.size))) return false;
  if ("uri" in file && typeof file.uri !== "string") return false;
  return true;
}
