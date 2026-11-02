import { ApiError } from "@biasmarket/types";

export function isSessionEndedDeleteError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
