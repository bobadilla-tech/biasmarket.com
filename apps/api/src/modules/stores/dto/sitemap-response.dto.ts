import { ApiProperty } from '@nestjs/swagger';

export class SitemapStoreItemDto {
  @ApiProperty()
  slug: string;
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
