import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import {
  AuthGuard,
  Public,
  Roles,
  Session,
} from "@thallesp/nestjs-better-auth";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { StorageService } from "../../storage/storage.service.js";
import {
  IMAGE_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  UploadedFileValidationPipe,
  type ValidatedUploadedFile,
} from "../../common/uploaded-file-validation.pipe.js";
import { CreateStoreReferenceDto } from "./dto/create-store-reference.dto.js";
import { UpdateStoreReferenceDto } from "./dto/update-store-reference.dto.js";
import {
  PublicStoreReferencesResponseDto,
  StoreReferenceResponseDto,
} from "./dto/store-reference-response.dto.js";
import { StoreReferencesService } from "./store-references.service.js";
import { readImageDimensions } from "./image-dimensions.js";

const REFERENCE_IMAGE_PIPE = new UploadedFileValidationPipe({
  allowedMimeTypes: IMAGE_UPLOAD_MIME_TYPES,
});

function serializeReference(reference: any): StoreReferenceResponseDto {
  const { privacyConfirmed: _privacyConfirmed, ...serialized } = reference;
  return {
    ...serialized,
    takenAt: reference.takenAt.toISOString(),
    createdAt: reference.createdAt.toISOString(),
  };
}

@Controller()
@ApiTags("StoreReferences")
export class StoreReferencesController {
  constructor(
    private readonly references: StoreReferencesService,
    private readonly storage: StorageService,
  ) {}

  @UseGuards(AuthGuard)
  @Get("stores/:storeId/references")
  @ApiOkResponse({ type: [StoreReferenceResponseDto] })
  async findAll(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
  ): Promise<StoreReferenceResponseDto[]> {
    return (await this.references.findAll(storeId, session.user.id)).map(
      serializeReference,
    );
  }

  @UseGuards(AuthGuard)
  @Post("stores/:storeId/references")
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file", "takenAt", "width", "height", "privacyConfirmed"],
      properties: {
        file: { type: "string", format: "binary" },
        takenAt: { type: "string", format: "date-time" },
        caption: { type: "string", maxLength: 240 },
        width: { type: "integer", minimum: 1, maximum: 12000 },
        height: { type: "integer", minimum: 1, maximum: 12000 },
        privacyConfirmed: { type: "boolean" },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES + 1 },
    }),
  )
  async create(
    @Param("storeId") storeId: string,
    @Session() session: UserSession,
    @UploadedFile(REFERENCE_IMAGE_PIPE) file: ValidatedUploadedFile,
    @Body() dto: CreateStoreReferenceDto,
  ): Promise<StoreReferenceResponseDto> {
    await this.references.assertOwnership(storeId, session.user.id);
    const dimensions = readImageDimensions(file.buffer, file.detectedMimeType);
    if (dimensions.width !== dto.width || dimensions.height !== dto.height) {
      throw new BadRequestException(
        "Las dimensiones no coinciden con la imagen enviada",
      );
    }
    if (!dto.privacyConfirmed) {
      throw new BadRequestException("Se requiere confirmar la privacidad");
    }
    const imageUrl = await this.storage.uploadStoreReferenceImage(
      file.buffer,
      file.detectedMimeType,
    );
    try {
      const reference = await this.references.create(storeId, session.user.id, {
        imageUrl,
        takenAt: new Date(dto.takenAt),
        caption: dto.caption?.trim() || undefined,
        width: dto.width,
        height: dto.height,
        privacyConfirmed: true,
      });
      return serializeReference(reference);
    } catch (error) {
      await this.storage.deleteImage(imageUrl).catch(() => undefined);
      throw error;
    }
  }

  @UseGuards(AuthGuard)
  @Patch("stores/:storeId/references/:referenceId")
  async update(
    @Param("storeId") storeId: string,
    @Param("referenceId") referenceId: string,
    @Session() session: UserSession,
    @Body() dto: UpdateStoreReferenceDto,
  ): Promise<StoreReferenceResponseDto> {
    return serializeReference(
      await this.references.update(referenceId, storeId, session.user.id, dto),
    );
  }

  @UseGuards(AuthGuard)
  @Delete("stores/:storeId/references/:referenceId")
  async delete(
    @Param("storeId") storeId: string,
    @Param("referenceId") referenceId: string,
    @Session() session: UserSession,
  ): Promise<StoreReferenceResponseDto> {
    const deleted = await this.references.delete(
      referenceId,
      storeId,
      session.user.id,
    );
    await this.storage.deleteImage(deleted.imageUrl).catch(() => undefined);
    return serializeReference(deleted);
  }

  @UseGuards(AuthGuard)
  @Roles(["admin"])
  @Patch("admin/store-references/:referenceId/hide")
  async hide(
    @Param("referenceId") referenceId: string,
    @Session() session: UserSession,
  ): Promise<StoreReferenceResponseDto> {
    return serializeReference(
      await this.references.setHidden(referenceId, session.user.id, true),
    );
  }

  @UseGuards(AuthGuard)
  @Roles(["admin"])
  @Patch("admin/store-references/:referenceId/unhide")
  async unhide(
    @Param("referenceId") referenceId: string,
    @Session() session: UserSession,
  ): Promise<StoreReferenceResponseDto> {
    return serializeReference(
      await this.references.setHidden(referenceId, session.user.id, false),
    );
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Get("stores/:slug/references/public")
  @ApiQuery({ name: "orden", required: false, enum: ["recientes", "antiguas"] })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ type: PublicStoreReferencesResponseDto })
  async findPublic(
    @Param("slug") slug: string,
    @Query("orden") rawOrder = "recientes",
    @Query("page") rawPage = "1",
    @Query("limit") rawLimit = "24",
  ): Promise<PublicStoreReferencesResponseDto> {
    if (rawOrder !== "recientes" && rawOrder !== "antiguas")
      throw new BadRequestException("orden inválido");
    const page = Number(rawPage);
    const limit = Number(rawLimit);
    if (!Number.isSafeInteger(page) || page < 1 || page > 201)
      throw new BadRequestException("page inválido");
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new BadRequestException("limit inválido");
    const result = await this.references.findPublic(
      slug,
      rawOrder,
      page,
      limit,
    );
    return { ...result, items: result.items.map(serializeReference) };
  }
}
