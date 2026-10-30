import { validate } from 'class-validator';
import { afterEach, describe, expect, it } from 'vitest';
import { UpdateCategoryDto } from './update-category.dto.js';

describe('UpdateCategoryDto imageUrl', () => {
  const initialPublicUrl = process.env.S3_PUBLIC_URL;
  const initialBucket = process.env.S3_BUCKET;

  afterEach(() => {
    if (initialPublicUrl === undefined) delete process.env.S3_PUBLIC_URL;
    else process.env.S3_PUBLIC_URL = initialPublicUrl;
    if (initialBucket === undefined) delete process.env.S3_BUCKET;
    else process.env.S3_BUCKET = initialBucket;
  });

  it('accepts category images from the configured storage host and null', async () => {
    process.env.S3_PUBLIC_URL = 'https://cdn.biasmarket.com';
    process.env.S3_BUCKET = 'products';

    for (const imageUrl of [
      'https://cdn.biasmarket.com/products/store-categories/category.png',
      null,
    ]) {
      const dto = Object.assign(new UpdateCategoryDto(), { imageUrl });
      expect(await validate(dto)).toEqual([]);
    }
  });

  it('rejects URLs outside the configured category image storage path', async () => {
    process.env.S3_PUBLIC_URL = 'https://cdn.biasmarket.com';
    process.env.S3_BUCKET = 'products';
    const dto = Object.assign(new UpdateCategoryDto(), {
      imageUrl: 'https://attacker.example/image.png',
    });

    expect(await validate(dto)).not.toEqual([]);
  });
});
