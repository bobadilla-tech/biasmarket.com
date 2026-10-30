import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { readImageDimensions } from "./image-dimensions.js";

describe("readImageDimensions", () => {
  it("reads PNG dimensions from the IHDR header", () => {
    const image = Buffer.alloc(24);
    image.writeUInt32BE(1200, 16);
    image.writeUInt32BE(800, 20);

    expect(readImageDimensions(image, "image/png")).toEqual({
      width: 1200,
      height: 800,
    });
  });

  it("reads JPEG dimensions from a start-of-frame segment", () => {
    const image = Buffer.alloc(11);
    image[0] = 0xff;
    image[1] = 0xd8;
    image[2] = 0xff;
    image[3] = 0xc0;
    image.writeUInt16BE(7, 4);
    image[6] = 8;
    image.writeUInt16BE(800, 7);
    image.writeUInt16BE(1200, 9);

    expect(readImageDimensions(image, "image/jpeg")).toEqual({
      width: 1200,
      height: 800,
    });
  });

  it("rejects malformed image data", () => {
    expect(() => readImageDimensions(Buffer.alloc(10), "image/jpeg")).toThrow(
      BadRequestException,
    );
  });
});
