import { describe, expect, it } from 'vitest';
import {
  IsSafeMarkdownConstraint,
  containsUnsafeMarkdown,
} from './is-safe-markdown.validator.js';

describe('containsUnsafeMarkdown', () => {
  it('accepts plain prose and a safe markdown subset', () => {
    const md = [
      '# Welcome',
      '',
      'We sell **official** merch. Visit [our IG](https://instagram.com/x).',
      '',
      '- fast shipping',
      '- 100% authentic',
      '',
      '![poster](https://cdn.biasmarket.com/store-content/a.jpg)',
    ].join('\n');
    expect(containsUnsafeMarkdown(md)).toBe(false);
  });

  it.each([
    ['<script>alert(1)</script>'],
    ['<SCRIPT src="x">'],
    ['<iframe src="https://evil.example"></iframe>'],
    ['<style>body{display:none}</style>'],
    ['<img src="x" onerror="alert(1)">'],
    ['<a href="javascript:alert(1)">x</a>'],
    ['[click](javascript:alert(1))'],
  ])('rejects %s', (value) => {
    expect(containsUnsafeMarkdown(value)).toBe(true);
  });
});

describe('IsSafeMarkdownConstraint', () => {
  const constraint = new IsSafeMarkdownConstraint();

  it("passes through non-strings (that is @IsString's job)", () => {
    expect(constraint.validate(undefined)).toBe(true);
    expect(constraint.validate(42)).toBe(true);
  });

  it('fails a string with a raw <script> tag', () => {
    expect(constraint.validate('hi <script>x</script>')).toBe(false);
  });

  it('passes a clean markdown string', () => {
    expect(constraint.validate('## About\n\nGreat store.')).toBe(true);
  });
});
