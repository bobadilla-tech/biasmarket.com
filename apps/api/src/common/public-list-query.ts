import { BadRequestException } from "@nestjs/common";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;
const MAX_QUERY_LENGTH = 100;

export interface PublicListQuery {
  limit: number;
  page: number;
  q?: string;
}

/**
 * Shared validation for every public, cross-store list endpoint
 * (/stores/featured, /stores/directory, /products/search) — one consistent
 * policy so pagination/search bounds can't silently widen a query instead of
 * rejecting a bad request.
 */
export function parsePublicListQuery(
  rawLimit: string | undefined,
  rawPage: string | undefined,
  rawQ: string | undefined,
): PublicListQuery {
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== undefined) {
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new BadRequestException("limit inválido");
    }
  }

  let page = 1;
  if (rawPage !== undefined) {
    page = Number(rawPage);
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException("page inválido");
    }
  }

  let q: string | undefined;
  if (rawQ !== undefined) {
    const trimmed = rawQ.trim();
    if (trimmed.length > MAX_QUERY_LENGTH) {
      throw new BadRequestException("q demasiado largo");
    }
    q = trimmed.length > 0 ? trimmed : undefined;
  }

  return { limit, page, q };
}
