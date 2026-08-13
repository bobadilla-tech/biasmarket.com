import { BadRequestException } from "@nestjs/common";
import { parsePublicListQuery } from "./public-list-query.js";

describe("parsePublicListQuery", () => {
  it("defaults limit to 24 and page to 1 when omitted", () => {
    expect(parsePublicListQuery(undefined, undefined, undefined)).toEqual({
      limit: 24,
      page: 1,
      q: undefined,
      category: undefined,
      sort: "latest",
    });
  });

  it("parses valid numeric limit/page", () => {
    expect(parsePublicListQuery("10", "2", undefined)).toEqual({
      limit: 10,
      page: 2,
      q: undefined,
      category: undefined,
      sort: "latest",
    });
  });

  it("rejects a limit above 50", () => {
    expect(() => parsePublicListQuery("51", undefined, undefined)).toThrow(
      BadRequestException,
    );
  });

  it("rejects a non-numeric limit", () => {
    expect(() => parsePublicListQuery("abc", undefined, undefined)).toThrow(
      BadRequestException,
    );
  });

  it("rejects a page below 1", () => {
    expect(() => parsePublicListQuery(undefined, "0", undefined)).toThrow(
      BadRequestException,
    );
  });

  it("trims q and rejects it past 100 characters", () => {
    expect(parsePublicListQuery(undefined, undefined, "  hello  ")).toEqual({
      limit: 24,
      page: 1,
      q: "hello",
      category: undefined,
      sort: "latest",
    });
    expect(() => parsePublicListQuery(undefined, undefined, "a".repeat(101)))
      .toThrow(BadRequestException);
  });

  it("treats a blank q as no filter", () => {
    expect(parsePublicListQuery(undefined, undefined, "   ")).toEqual({
      limit: 24,
      page: 1,
      q: undefined,
      category: undefined,
      sort: "latest",
    });
  });

  it("parses and trims category, defaulting sort to latest", () => {
    expect(
      parsePublicListQuery(undefined, undefined, undefined, "  Photocards "),
    ).toEqual({
      limit: 24,
      page: 1,
      q: undefined,
      category: "Photocards",
      sort: "latest",
    });
  });

  it("parses a valid sort and rejects unknown values", () => {
    expect(
      parsePublicListQuery(
        undefined,
        undefined,
        undefined,
        undefined,
        "bestseller",
      ),
    ).toEqual(expect.objectContaining({ sort: "bestseller" }));
    expect(() =>
      parsePublicListQuery(
        undefined,
        undefined,
        undefined,
        undefined,
        "popular",
      )
    ).toThrow(BadRequestException);
  });

  it("rejects a category past 100 characters", () => {
    expect(() =>
      parsePublicListQuery(undefined, undefined, undefined, "a".repeat(101))
    ).toThrow(BadRequestException);
  });
});
