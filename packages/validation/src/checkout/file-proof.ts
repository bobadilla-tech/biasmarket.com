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
