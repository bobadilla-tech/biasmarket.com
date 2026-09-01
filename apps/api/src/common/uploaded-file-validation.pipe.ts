import { BadRequestException, type PipeTransform } from '@nestjs/common';

export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

export const IMAGE_UPLOAD_MIME_TYPES = ['image/jpeg', 'image/png'] as const;
export const PROOF_UPLOAD_MIME_TYPES = [
  ...IMAGE_UPLOAD_MIME_TYPES,
  'application/pdf',
] as const;

export type SupportedUploadMimeType =
  (typeof IMAGE_UPLOAD_MIME_TYPES)[number] | 'application/pdf';

export type ValidatedUploadedFile = Express.Multer.File & {
  detectedMimeType: SupportedUploadMimeType;
};

type ValidationMessages = {
  missingFile: string;
  fileTooLarge: string;
  unsupportedType: string;
};

type UploadedFileValidationOptions = {
  allowedMimeTypes: readonly SupportedUploadMimeType[];
  fileIsRequired?: boolean;
  maxSizeBytes?: number;
  messages?: Partial<ValidationMessages>;
};

const DEFAULT_MESSAGES: ValidationMessages = {
  missingFile: 'Falta el archivo',
  fileTooLarge: 'Máximo 5MB',
  unsupportedType: 'Solo JPEG o PNG',
};

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function detectUploadMimeType(
  buffer: Buffer,
): SupportedUploadMimeType | null {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  if (buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (buffer.subarray(0, 4).toString('latin1') === '%PDF') {
    return 'application/pdf';
  }
  return null;
}

/**
 * Validates Multer uploads by byte size and file signature, never by the
 * caller-controlled Content-Type header. The detected type is returned with
 * the file so controllers use the same trusted value when persisting it.
 */
export class UploadedFileValidationPipe implements PipeTransform {
  private readonly options: Required<
    Pick<UploadedFileValidationOptions, 'fileIsRequired' | 'maxSizeBytes'>
  > &
    Omit<UploadedFileValidationOptions, 'fileIsRequired' | 'maxSizeBytes'>;
  private readonly messages: ValidationMessages;

  constructor(options: UploadedFileValidationOptions) {
    this.options = {
      ...options,
      fileIsRequired: options.fileIsRequired ?? true,
      maxSizeBytes: options.maxSizeBytes ?? MAX_UPLOAD_SIZE_BYTES,
    };
    this.messages = { ...DEFAULT_MESSAGES, ...options.messages };
  }

  transform(
    file: Express.Multer.File | undefined,
  ): ValidatedUploadedFile | undefined {
    if (!file) {
      if (this.options.fileIsRequired) {
        throw new BadRequestException(this.messages.missingFile);
      }
      return undefined;
    }

    if (file.size > this.options.maxSizeBytes) {
      throw new BadRequestException(this.messages.fileTooLarge);
    }

    const detectedMimeType = detectUploadMimeType(file.buffer);
    if (
      !detectedMimeType ||
      !this.options.allowedMimeTypes.includes(detectedMimeType)
    ) {
      throw new BadRequestException(this.messages.unsupportedType);
    }

    return { ...file, detectedMimeType };
  }
}
