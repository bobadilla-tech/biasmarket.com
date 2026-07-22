import { Body, Controller, Get, Post, Patch, UseGuards, Delete, Param, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { AuthGuard, Public, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { StoresService } from './stores.service.js';
import { UpdateStoreDto } from './dto/update-store.dto.js';
import { CreateStoreDto } from './dto/create-store.dto.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { StorageService } from '../../storage/storage.service.js';

@Controller('stores')
export class StoresController {
  constructor(
    private readonly stores: StoresService,
    private readonly storage: StorageService,
  ) { }

  @UseGuards(AuthGuard)
  @Post()
  create(@Session() session: UserSession, @Body() dto: CreateStoreDto) {
    return this.stores.create(session.user.id, dto);
  }

  @UseGuards(AuthGuard)
  @Get('/me/stores')
  findMine(@Session() session: UserSession) {
    return this.stores.findAllForUser(session.user.id);
  }

  @UseGuards(AuthGuard)
  @Get('by-slug/:slug')
  findBySlug(@Param('slug') slug: string, @Session() session: UserSession) {
    return this.stores.findBySlugForOwner(slug, session.user.id);
  }

  @UseGuards(AuthGuard)
  @Patch(':storeId')
  update(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.stores.update(storeId, session.user.id, dto);
  }

  @UseGuards(AuthGuard)
  @Delete(':storeId')
  delete(@Param('storeId') storeId: string, @Session() session: UserSession) {
    return this.stores.delete(storeId, session.user.id);
  }

  @Public()
  @Get('public')
  findAllPublic() {
    return this.stores.findAllPublic();
  }

  @Public()
  @Get('collections/public')
  findCollectionsPublic() {
    return this.stores.findCollectionsPublic();
  }

  @Public()
  @Get(':slug/public')
  findPublic(@Param('slug') slug: string) {
    return this.stores.findPublicBySlug(slug);
  }

  @Public()
  @Get(':slug/categories/public')
  findCategoriesPublic(@Param('slug') slug: string) {
    return this.stores.findCategoriesPublic(slug);
  }

  @UseGuards(AuthGuard)
  @Post(':storeId/logo')
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(
    @Param('storeId') storeId: string,
    @Session() session: UserSession,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Falta el archivo');
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException('Máximo 5MB');

    const isJpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8;
    const isPng = file.buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    if (!isJpeg && !isPng) throw new BadRequestException('Solo JPEG o PNG');

    const url = await this.storage.uploadImage(file.buffer, isPng ? 'image/png' : 'image/jpeg');
    return this.stores.updateLogo(storeId, session.user.id, url);
  }

}
