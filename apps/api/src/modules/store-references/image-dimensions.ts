import { BadRequestException } from "@nestjs/common";
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
  if (mimeType === "image/png" && buffer.length >= 24) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
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
