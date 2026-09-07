import { ApiProperty } from '@nestjs/swagger';

export class SitemapStoreItemDto {
  @ApiProperty()
  slug: string;

  // ISO-8601. `Store.contentStaleAt` if the store has had a storefront-visible
  // edit, else its `createdAt`. Drives the sitemap entry's `<lastmod>`.
  @ApiProperty()
  lastModified: string;
}

export class SitemapStorePageDto {
  @ApiProperty({ type: [SitemapStoreItemDto] })
  items: SitemapStoreItemDto[];

  @ApiProperty()
  total: number;
}

export class SitemapStoreCountDto {
  @ApiProperty()
  total: number;
}
