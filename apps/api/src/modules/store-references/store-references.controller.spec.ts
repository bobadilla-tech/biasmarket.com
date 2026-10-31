import {
  ForbiddenException,
  type INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { ExecutionContext } from "@nestjs/common";
import request from "supertest";
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
    update: vi.fn().mockResolvedValue(reference),
    findPublic: vi.fn().mockResolvedValue({
      items: [reference],
      total: 1,
      page: 1,
      limit: 24,
    }),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [StoreReferencesController],
      providers: [
        { provide: StoreReferencesService, useValue: service },
        { provide: StorageService, useValue: {} },
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
