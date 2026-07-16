import { describe, expect, it } from "vitest";
import { slugify } from "./index";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("trims leading and trailing whitespace", () => {
    expect(slugify("  Trim Me  ")).toBe("trim-me");
  });

  it("collapses runs of non-alphanumeric characters into a single hyphen", () => {
    expect(slugify("Multiple   Spaces!!")).toBe("multiple-spaces");
  });

  it("strips leading and trailing hyphens after replacement", () => {
    expect(slugify("!!!Wrap Me!!!")).toBe("wrap-me");
  });

  it("leaves an already-hyphenated slug unchanged", () => {
    expect(slugify("already-hyphenated")).toBe("already-hyphenated");
  });

  it("returns an empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("returns an empty string for input that is only symbols", () => {
    expect(slugify("!!!___***")).toBe("");
  });

  it("drops accented/unicode letters as non-alphanumeric", () => {
    expect(slugify("Café Örnek")).toBe("caf-rnek");
  });
});
