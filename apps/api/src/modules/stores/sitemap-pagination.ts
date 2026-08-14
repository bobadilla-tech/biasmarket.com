import { BadRequestException } from '@nestjs/common';

export const SITEMAP_PAGE_LIMIT = 50_000;
export const SITEMAP_MAX_OFFSET = 10_000_000;

const INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/;

function parseSafeInteger(
  name: 'limit' | 'offset',
  value: string | undefined,
): number {
  if (value === undefined || !INTEGER_PATTERN.test(value)) {
    throw new BadRequestException(
      `${name} must be a safe non-negative integer`,
    );
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new BadRequestException(
      `${name} must be a safe non-negative integer`,
    );
  }
  return parsed;
}

export function parseSitemapPagination(
  limit: string | undefined,
  offset: string | undefined,
): { limit: number; offset: number } {
  const parsedLimit = parseSafeInteger('limit', limit);
  const parsedOffset = parseSafeInteger('offset', offset);

  if (parsedLimit < 1 || parsedLimit > SITEMAP_PAGE_LIMIT) {
    throw new BadRequestException(
      `limit must be between 1 and ${SITEMAP_PAGE_LIMIT}`,
    );
  }
  if (parsedOffset > SITEMAP_MAX_OFFSET) {
    throw new BadRequestException(
      `offset must be at most ${SITEMAP_MAX_OFFSET}`,
    );
  }

  return { limit: parsedLimit, offset: parsedOffset };
}
