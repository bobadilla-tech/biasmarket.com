import { describe, expect, it } from "vitest";
import { chunkEntityRange } from "./chunk-range";

describe("chunkEntityRange", () => {
  it("maps the first chunk", () => {
    expect(chunkEntityRange(0, 50_000, 2)).toEqual({
      entityOffset: 0,
      entityLimit: 25_000,
      sliceStart: 0,
      sliceEnd: 50_000,
    });
  });

  it("handles uneven locale fan-out and aligned boundaries", () => {
    expect(chunkEntityRange(1, 5, 2)).toEqual({
      entityOffset: 2,
      entityLimit: 3,
      sliceStart: 1,
      sliceEnd: 6,
    });
  });

  it("allows a boundary to straddle an entity", () => {
    expect(chunkEntityRange(1, 4, 3)).toEqual({
      entityOffset: 1,
      entityLimit: 2,
      sliceStart: 1,
      sliceEnd: 5,
    });
  });

  it.each([
    [-1, 10, 2],
    [0, 0, 2],
    [0, 10, 0],
    [Number.MAX_SAFE_INTEGER, 50_000, 2],
  ])("rejects invalid range %j", (chunkId, chunkSize, locales) => {
    expect(() => chunkEntityRange(chunkId, chunkSize, locales)).toThrow(
      RangeError,
    );
  });
});
