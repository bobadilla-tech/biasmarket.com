import {
  MIN_INDEXABLE_PRODUCTS,
  SITEMAP_INDEXABLE_STORE_WHERE,
  isStoreIndexable,
  type StoreIndexabilityInput,
} from './store-indexability.js';

const base: StoreIndexabilityInput = {
  isPublic: true,
  isDemo: false,
  ownerBanned: false,
  publishedProductCount: MIN_INDEXABLE_PRODUCTS,
  bio: 'Official merch for a real artist, curated by the fan club.',
  aboutMarkdown: null,
  hasRealTextBlockSection: false,
};

describe('isStoreIndexable', () => {
  it('indexes a public store at the product bar with a bio', () => {
    expect(isStoreIndexable(base)).toBe(true);
  });

  it('bars a non-public store even if everything else qualifies', () => {
    expect(isStoreIndexable({ ...base, isPublic: false })).toBe(false);
  });

  it('bars a demo store', () => {
    expect(isStoreIndexable({ ...base, isDemo: true })).toBe(false);
  });

  it('bars a store whose owner is banned', () => {
    expect(isStoreIndexable({ ...base, ownerBanned: true })).toBe(false);
  });

  it('bars a store below the published-product bar', () => {
    expect(
      isStoreIndexable({
        ...base,
        publishedProductCount: MIN_INDEXABLE_PRODUCTS - 1,
      }),
    ).toBe(false);
  });

  it('requires prose from at least one source', () => {
    expect(
      isStoreIndexable({
        ...base,
        bio: null,
        aboutMarkdown: null,
        hasRealTextBlockSection: false,
      }),
    ).toBe(false);
  });

  it('accepts aboutMarkdown as the prose source', () => {
    expect(
      isStoreIndexable({ ...base, bio: null, aboutMarkdown: '## About us' }),
    ).toBe(true);
  });

  it('accepts a real TEXT_BLOCK section as the prose source', () => {
    expect(
      isStoreIndexable({
        ...base,
        bio: null,
        aboutMarkdown: null,
        hasRealTextBlockSection: true,
      }),
    ).toBe(true);
  });

  it('treats whitespace-only bio and aboutMarkdown as no prose', () => {
    expect(
      isStoreIndexable({ ...base, bio: '   ', aboutMarkdown: '\n\t ' }),
    ).toBe(false);
  });

  it('counts a store above the product bar', () => {
    expect(
      isStoreIndexable({
        ...base,
        publishedProductCount: MIN_INDEXABLE_PRODUCTS + 10,
      }),
    ).toBe(true);
  });
});

describe('SITEMAP_INDEXABLE_STORE_WHERE (D7)', () => {
  it('gates on a non-banned owner and the published-product bar', () => {
    expect(SITEMAP_INDEXABLE_STORE_WHERE.owner).toEqual({
      banned: { not: true },
    });
    expect(SITEMAP_INDEXABLE_STORE_WHERE.publishedProductCount).toEqual({
      gte: MIN_INDEXABLE_PRODUCTS,
    });
  });

  it('accepts prose from bio, aboutMarkdown, or a TEXT_BLOCK section (loose OR)', () => {
    expect(SITEMAP_INDEXABLE_STORE_WHERE.OR).toEqual([
      { bio: { not: null } },
      { aboutMarkdown: { not: null } },
      { sections: { some: { type: 'TEXT_BLOCK' } } },
    ]);
  });
});
