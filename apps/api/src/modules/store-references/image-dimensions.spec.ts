import { BadRequestException } from "@nestjs/common";
import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readImageDimensions } from "./image-dimensions.js";

describe("readImageDimensions", () => {
  function pngChunk(type: string, data: Buffer) {
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    chunk.write(type, 4, "ascii");
    data.copy(chunk, 8);
    chunk.writeUInt32BE(
      crc32(chunk.subarray(4, 8 + data.length)),
      8 + data.length,
    );
    return chunk;
  }

  function pngImage() {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(1200, 0);
    header.writeUInt32BE(800, 4);
    header[8] = 8;
    header[9] = 2;
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    return Buffer.concat([
      signature,
      pngChunk("IHDR", header),
      pngChunk("IDAT", Buffer.from([1, 2, 3])),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);
  }

  it("reads PNG dimensions from the IHDR header", () => {
    expect(readImageDimensions(pngImage(), "image/png")).toEqual({
      width: 1200,
      height: 800,
    });
  });

  it("rejects PNG data without a valid IHDR chunk", () => {
    const image = pngImage();
    image.write("IDAT", 12, "ascii");

    expect(() => readImageDimensions(image, "image/png")).toThrow(
      BadRequestException,
    );
  });

  it("rejects PNG chunks with invalid CRCs", () => {
    const image = pngImage();
    image[image.length - 5] = 1;

    expect(() => readImageDimensions(image, "image/png")).toThrow(
      BadRequestException,
    );
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
