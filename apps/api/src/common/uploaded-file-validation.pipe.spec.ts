import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  IMAGE_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  PROOF_UPLOAD_MIME_TYPES,
  UploadedFileValidationPipe,
} from './uploaded-file-validation.pipe.js';

function upload(buffer: Buffer, size = buffer.length): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'upload.bin',
    encoding: '7bit',
    mimetype: 'application/octet-stream',
    size,
    buffer,
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
  };
}

describe('UploadedFileValidationPipe', () => {
  const imagePipe = new UploadedFileValidationPipe({
    allowedMimeTypes: IMAGE_UPLOAD_MIME_TYPES,
  });

  it('rejects files larger than the configured limit', () => {
    expect(() =>
      imagePipe.transform(
        upload(Buffer.from([0xff, 0xd8]), MAX_UPLOAD_SIZE_BYTES + 1),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a file whose magic bytes are not allowed', () => {
    expect(() =>
      imagePipe.transform(upload(Buffer.from('not an image'))),
    ).toThrow(BadRequestException);
  });

  it('returns the trusted MIME type detected from JPEG magic bytes', () => {
    const result = imagePipe.transform(
      upload(Buffer.from([0xff, 0xd8, 0xff, 0xe0])),
    );

    expect(result?.detectedMimeType).toBe('image/jpeg');
  });

  it('allows PDF only when the route opts into proof MIME types', () => {
    const pdf = upload(Buffer.from('%PDF-1.7'));

    expect(() => imagePipe.transform(pdf)).toThrow(BadRequestException);
    expect(
      new UploadedFileValidationPipe({
        allowedMimeTypes: PROOF_UPLOAD_MIME_TYPES,
      }).transform(pdf)?.detectedMimeType,
    ).toBe('application/pdf');
  });

  it('allows a missing file for optional upload routes', () => {
    const optionalPipe = new UploadedFileValidationPipe({
      allowedMimeTypes: IMAGE_UPLOAD_MIME_TYPES,
      fileIsRequired: false,
    });

    expect(optionalPipe.transform(undefined)).toBeUndefined();
  });
});
