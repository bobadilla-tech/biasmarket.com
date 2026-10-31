import { BadRequestException } from "@nestjs/common";
import { crc32 } from "node:zlib";
import type { SupportedUploadMimeType } from "../../common/uploaded-file-validation.pipe.js";

export interface ImageDimensions {
  width: number;
  height: number;
}

const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export function readImageDimensions(
  buffer: Buffer,
  mimeType: SupportedUploadMimeType,
): ImageDimensions {
  if (mimeType === "image/png" && buffer.length >= 57) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (buffer.subarray(0, 8).equals(signature)) {
      let offset = signature.length;
      let width: number | undefined;
      let height: number | undefined;
      let hasImageData = false;

      while (offset + 12 <= buffer.length) {
        const dataLength = buffer.readUInt32BE(offset);
        const chunkEnd = offset + 12 + dataLength;
        if (chunkEnd > buffer.length) break;

        const type = buffer.toString("ascii", offset + 4, offset + 8);
        const crcRange = buffer.subarray(offset + 4, offset + 8 + dataLength);
        const expectedCrc = buffer.readUInt32BE(offset + 8 + dataLength);
        if (crc32(crcRange) !== expectedCrc) break;

        if (offset === signature.length) {
          if (type !== "IHDR" || dataLength !== 13) break;
          width = buffer.readUInt32BE(offset + 8);
          height = buffer.readUInt32BE(offset + 12);
          if (width === 0 || height === 0) break;
        } else if (type === "IHDR") {
          break;
        }

        if (type === "IDAT" && dataLength > 0) hasImageData = true;
        if (type === "IEND") {
          if (
            dataLength === 0 &&
            hasImageData &&
            chunkEnd === buffer.length &&
            width !== undefined &&
            height !== undefined
          ) {
            return { width, height };
          }
          break;
        }

        offset = chunkEnd;
      }
    }
  }

  if (
    mimeType === "image/jpeg" &&
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8
  ) {
    let offset = 2;
    while (offset + 3 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      while (buffer[offset] === 0xff) offset += 1;
      const marker = buffer[offset++]!;
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (offset + 1 >= buffer.length) break;
      const segmentLength = buffer.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
      if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
        if (segmentLength < 7) break;
        return {
          height: buffer.readUInt16BE(offset + 3),
          width: buffer.readUInt16BE(offset + 5),
        };
      }
      offset += segmentLength;
    }
  }

  throw new BadRequestException(
    "No se pudieron leer las dimensiones de la imagen",
  );
}
