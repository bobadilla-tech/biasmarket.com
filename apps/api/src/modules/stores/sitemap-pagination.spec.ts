import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  parseSitemapPagination,
  SITEMAP_MAX_OFFSET,
  SITEMAP_PAGE_LIMIT,
} from "./sitemap-pagination.js";

describe("parseSitemapPagination", () => {
  it("accepts a bounded sitemap page", () => {
    expect(parseSitemapPagination("50000", "0")).toEqual({
      limit: SITEMAP_PAGE_LIMIT,
      offset: 0,
    });
  });

  it.each([
    [undefined, "0"],
    ["0", "0"],
    ["50001", "0"],
    ["1", "01"],
    ["1", "-1"],
    ["1", String(SITEMAP_MAX_OFFSET + 1)],
    ["1", "9007199254740992"],
  ])("rejects invalid limit/offset pair %j", (limit, offset) => {
    expect(() => parseSitemapPagination(limit, offset)).toThrow(
      BadRequestException,
    );
  });
});
