import {
  registerDecorator,
  ValidatorConstraint,
  type ValidationOptions,
  type ValidatorConstraintInterface,
} from 'class-validator';

// Fail-fast guard for seller-authored markdown (Store.aboutMarkdown). The real
// security boundary is the render-time allowlist in the web app
// (lib/store-markdown, PR D2) — this only rejects obviously-hostile constructs
// on write so a bad value never reaches storage. Keep the two in sync.
const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /<\s*script\b/i,
  /<\s*iframe\b/i,
  /<\s*style\b/i,
  // inline event-handler attribute inside a tag: <img src=x onerror=...>
  /<[^>]*\son\w+\s*=/i,
  /javascript\s*:/i,
];

export function containsUnsafeMarkdown(value: string): boolean {
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(value));
}

@ValidatorConstraint({ name: 'isSafeMarkdown', async: false })
export class IsSafeMarkdownConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    // Type mismatches are @IsString's job — only reject strings we can prove bad.
    if (typeof value !== 'string') return true;
    return !containsUnsafeMarkdown(value);
  }

  defaultMessage(): string {
    return 'aboutMarkdown contains disallowed HTML or script content';
  }
}

export function IsSafeMarkdown(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsSafeMarkdownConstraint,
    });
  };
}
