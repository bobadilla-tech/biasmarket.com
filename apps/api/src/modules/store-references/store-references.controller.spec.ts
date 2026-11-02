import {
  ForbiddenException,
  type INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { ExecutionContext } from "@nestjs/common";
import request from "supertest";
import { crc32 } from "node:zlib";
import { ThrottlerGuard } from "@nestjs/throttler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGuard } from "@thallesp/nestjs-better-auth";
import { StoreReferencesController } from "./store-references.controller.js";
import { StoreReferencesService } from "./store-references.service.js";
import { StorageService } from "../../storage/storage.service.js";

describe("StoreReferencesController admin routes", () => {
  let app: INestApplication;
  const reference = {
    id: "reference-1",
    takenAt: new Date("2026-10-01T00:00:00.000Z"),
    createdAt: new Date("2026-10-02T00:00:00.000Z"),
  };
  const service = {
    setHidden: vi.fn().mockResolvedValue(reference),
    findOwned: vi.fn().mockResolvedValue({
      ...reference,
      imageUrl: "https://cdn.test/old.jpg",
    }),
    update: vi.fn().mockResolvedValue({
      updated: reference,
      previousImageUrl: "https://cdn.test/old.jpg",
    }),
    findPublic: vi.fn().mockResolvedValue({
      items: [reference],
      total: 1,
      page: 1,
      limit: 24,
    }),
  };
  const storage = {
    uploadStoreReferenceImage: vi
      .fn()
      .mockResolvedValue("https://cdn.test/new.jpg"),
    deleteStoreReferenceImage: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [StoreReferencesController],
      providers: [
        { provide: StoreReferencesService, useValue: service },
        { provide: StorageService, useValue: storage },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest<{
            headers: Record<string, string | undefined>;
            session?: { user: { id: string; role: string } };
          }>();
          const role = req.headers["x-test-role"];
          if (!role) throw new UnauthorizedException();
          const roles = Reflect.getMetadata("ROLES", context.getHandler()) as
            string[] | undefined;
          if (roles && !roles.includes(role)) throw new ForbiddenException();
          req.session = { user: { id: `${role}-1`, role } };
          return true;
        },
      })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    vi.clearAllMocks();
  });

  function pngImage() {
    const pngChunk = (type: string, data: Buffer) => {
      const chunk = Buffer.alloc(12 + data.length);
      chunk.writeUInt32BE(data.length, 0);
      chunk.write(type, 4, "ascii");
      data.copy(chunk, 8);
      chunk.writeUInt32BE(
        crc32(chunk.subarray(4, 8 + data.length)),
        8 + data.length,
      );
      return chunk;
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(1200, 0);
    header.writeUInt32BE(800, 4);
    header[8] = 8;
    header[9] = 2;
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      pngChunk("IHDR", header),
      pngChunk("IDAT", Buffer.from([1, 2, 3])),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);
  }

  it.each([
    ["hide", true],
    ["unhide", false],
  ] as const)("allows an admin to %s a reference", async (action, hidden) => {
    await request(app.getHttpServer())
      .patch(`/admin/store-references/reference-1/${action}`)
      .set("x-test-role", "admin")
      .expect(200);

    expect(service.setHidden).toHaveBeenCalledWith(
      "reference-1",
      "admin-1",
      hidden,
    );
  });

  it.each(["hide", "unhide"])(
    "denies a non-admin from using %s",
    async (action) => {
      await request(app.getHttpServer())
        .patch(`/admin/store-references/reference-1/${action}`)
        .set("x-test-role", "user")
        .expect(403);

      expect(service.setHidden).not.toHaveBeenCalled();
    },
  );

  it("allows a seller to keep a new reference hidden without privacy confirmation", async () => {
    await request(app.getHttpServer())
      .patch("/stores/store-1/references/reference-1")
      .set("x-test-role", "user")
      .field("hidden", "true")
      .expect(200);

    expect(service.update).toHaveBeenCalledWith(
      "reference-1",
      "store-1",
      "user-1",
      expect.objectContaining({ hidden: true }),
    );
  });

  it("requires privacy confirmation when a seller publishes a reference", async () => {
    await request(app.getHttpServer())
      .patch("/stores/store-1/references/reference-1")
      .set("x-test-role", "user")
      .field("hidden", "false")
      .expect(400);

    expect(service.update).not.toHaveBeenCalled();
  });

  it("rejects malformed boolean values instead of publishing a reference", async () => {
    await request(app.getHttpServer())
      .patch("/stores/store-1/references/reference-1")
      .set("x-test-role", "user")
      .field("hidden", "tru")
      .field("privacyConfirmed", "true")
      .expect(400);

    expect(service.update).not.toHaveBeenCalled();
  });

  it("ignores image dimensions when no replacement image is uploaded", async () => {
    await request(app.getHttpServer())
      .patch("/stores/store-1/references/reference-1")
      .set("x-test-role", "user")
      .field("width", "1")
      .field("height", "1")
      .expect(200);

    expect(service.update).toHaveBeenCalledWith(
      "reference-1",
      "store-1",
      "user-1",
      expect.objectContaining({ width: undefined, height: undefined }),
    );
  });

  it("derives replacement dimensions and deletes the displaced image", async () => {
    await request(app.getHttpServer())
      .patch("/stores/store-1/references/reference-1")
      .set("x-test-role", "user")
      .field("privacyConfirmed", "true")
      .attach("file", pngImage(), {
        filename: "replacement.png",
        contentType: "image/png",
      })
      .expect(200);

    expect(storage.uploadStoreReferenceImage).toHaveBeenCalledOnce();
    expect(service.update).toHaveBeenCalledWith(
      "reference-1",
      "store-1",
      "user-1",
      expect.objectContaining({
        imageUrl: "https://cdn.test/new.jpg",
        width: 1200,
        height: 800,
        privacyConfirmed: true,
      }),
    );
    expect(storage.deleteStoreReferenceImage).toHaveBeenCalledWith(
      "https://cdn.test/old.jpg",
    );
  });

  it.each(["202", "9007199254740992"])(
    "rejects unsafe or unreachable public reference page %s",
    async (page) => {
      await request(app.getHttpServer())
        .get(`/stores/store/references/public?page=${page}`)
        .expect(400);

      expect(service.findPublic).not.toHaveBeenCalled();
    },
  );
});
