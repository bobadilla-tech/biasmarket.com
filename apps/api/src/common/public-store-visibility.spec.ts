import {
  PUBLIC_STORE_HAS_LISTABLE_PRODUCT,
  PUBLIC_STORE_VISIBILITY,
} from './public-store-visibility.js';

describe('public store visibility fragments', () => {
  it('PUBLIC_STORE_VISIBILITY gates on both flags and nothing else', () => {
    expect(PUBLIC_STORE_VISIBILITY).toEqual({
      isPublic: true,
      isDemo: false,
    });
  });

  it('PUBLIC_STORE_HAS_LISTABLE_PRODUCT stays a separate predicate', () => {
    expect(PUBLIC_STORE_HAS_LISTABLE_PRODUCT).toEqual({
      owner: { banned: { not: true } },
      products: {
        some: { status: 'PUBLISHED', deletedAt: null, discontinued: false },
      },
    });
    // The two fragments must not overlap — visibility is safe for every
    // public read, the listable predicate only for listings.
    expect(PUBLIC_STORE_HAS_LISTABLE_PRODUCT).not.toHaveProperty('isPublic');
    expect(PUBLIC_STORE_HAS_LISTABLE_PRODUCT).not.toHaveProperty('isDemo');
  });
});
