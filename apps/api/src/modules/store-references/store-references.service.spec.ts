import { Test, type TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { type Mock, vi } from "vitest";
import { PrismaService } from "../../prisma/prisma.service.js";
import { StoreReferencesService } from "./store-references.service.js";

describe("StoreReferencesService", () => {
  let service: StoreReferencesService;
  let prisma: {
    store: { findUnique: Mock; findFirst: Mock };
    storeReference: {
      count: Mock;
      create: Mock;
      findMany: Mock;
      findFirst: Mock;
      findUnique: Mock;
      update: Mock;
      delete: Mock;
    };
    auditLog: { create: Mock };
    $transaction: Mock;
    $queryRaw: Mock;
  };

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn(), findFirst: vi.fn() },
      storeReference: {
        count: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      auditLog: { create: vi.fn() },
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn((callback: (tx: unknown) => unknown) =>
        callback(prisma),
      ),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreReferencesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(StoreReferencesService);
  });

  it("rejects writes by users who do not own the store", async () => {
    prisma.store.findUnique.mockResolvedValue({
      id: "store-a",
      ownerId: "owner-a",
    });
    await expect(
      service.create("store-a", "owner-b", {
        imageUrl: "https://cdn.test/ref.jpg",
        takenAt: new Date(),
        width: 800,
        height: 600,
        privacyConfirmed: true,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.storeReference.create).not.toHaveBeenCalled();
  });

  it("stores an owned reference and writes an audit event atomically", async () => {
    prisma.store.findUnique.mockResolvedValue({
      id: "store-a",
      ownerId: "owner-a",
    });
    prisma.storeReference.count.mockResolvedValue(0);
    prisma.storeReference.create.mockResolvedValue({ id: "ref-1" });

    await service.create("store-a", "owner-a", {
      imageUrl: "https://cdn.test/ref.jpg",
      takenAt: new Date("2026-10-01T00:00:00.000Z"),
      width: 800,
      height: 600,
      privacyConfirmed: true,
    });

    expect(prisma.storeReference.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: "store-a",
        imageUrl: "https://cdn.test/ref.jpg",
        privacyConfirmed: true,
      }),
    });
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: "store-a",
        actorId: "owner-a",
        action: "store_reference.created",
        entityId: "ref-1",
      }),
    });
  });

  it("updates visibility and replacement image fields only within the owned store", async () => {
    prisma.store.findUnique.mockResolvedValue({
      id: "store-a",
      ownerId: "owner-a",
    });
    prisma.storeReference.findFirst.mockResolvedValue({
      id: "ref-1",
      storeId: "store-a",
      imageUrl: "https://cdn.test/old.jpg",
    });
    prisma.storeReference.update.mockResolvedValue({
      id: "ref-1",
      hidden: false,
      imageUrl: "https://cdn.test/new.jpg",
      width: 640,
      height: 480,
    });

    await service.update("ref-1", "store-a", "owner-a", {
      hidden: false,
      privacyConfirmed: true,
      imageUrl: "https://cdn.test/new.jpg",
      width: 640,
      height: 480,
    });

    expect(prisma.storeReference.update).toHaveBeenCalledWith({
      where: { id: "ref-1" },
      data: {
        hidden: false,
        privacyConfirmed: true,
        imageUrl: "https://cdn.test/new.jpg",
        width: 640,
        height: 480,
      },
    });
  });

  it("returns an empty owned list when the store has no references", async () => {
    prisma.store.findUnique.mockResolvedValue({
      id: "store-a",
      ownerId: "owner-a",
    });
    prisma.storeReference.findMany.mockResolvedValue([]);

    await expect(service.findAll("store-a", "owner-a")).resolves.toEqual([]);
  });

  it("filters hidden references and sorts newest first on the public API", async () => {
    prisma.store.findFirst.mockResolvedValue({ id: "store-a" });
    prisma.storeReference.findMany.mockResolvedValue([]);
    prisma.storeReference.count.mockResolvedValue(0);

    await service.findPublic("shop", "recientes", 2, 24);

    expect(prisma.store.findFirst).toHaveBeenCalledWith({
      where: { slug: "shop", isPublic: true, isDemo: false },
      select: { id: true },
    });

    expect(prisma.storeReference.findMany).toHaveBeenCalledWith({
      where: { storeId: "store-a", hidden: false },
      orderBy: [{ takenAt: "desc" }, { createdAt: "desc" }],
      skip: 24,
      take: 24,
    });
    expect(prisma.storeReference.count).toHaveBeenCalledWith({
      where: { storeId: "store-a", hidden: false },
    });
  });

  it("does not return public data for an unknown store", async () => {
    prisma.store.findFirst.mockResolvedValue(null);
    await expect(
      service.findPublic("missing", "recientes", 1, 24),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.storeReference.findMany).not.toHaveBeenCalled();
  });
});
