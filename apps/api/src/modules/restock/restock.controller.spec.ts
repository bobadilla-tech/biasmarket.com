import { Test, TestingModule } from "@nestjs/testing";
import { type Mock, vi } from "vitest";
import { RestockController } from "./restock.controller.js";
import { RestockService } from "./restock.service.js";

vi.mock("@thallesp/nestjs-better-auth", () => ({
  AuthGuard: class AuthGuard {},
  Public: () => () => undefined,
  Session: () => () => undefined,
}));

vi.mock("@nestjs/throttler", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nestjs/throttler")>();
  return { ...actual, ThrottlerGuard: class ThrottlerGuard {} };
});

describe("RestockController", () => {
  let controller: RestockController;
  let service: { create: Mock; listForStore: Mock; count: Mock };

  beforeEach(async () => {
    service = {
      create: vi.fn(),
      listForStore: vi.fn(),
      count: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RestockController],
      providers: [{ provide: RestockService, useValue: service }],
    }).compile();

    controller = module.get<RestockController>(RestockController);
  });

  it("create() delegates to service.create with slug and dto", async () => {
    service.create.mockResolvedValue({
      id: "req-1",
      createdAt: new Date("2026-08-05T12:00:00.000Z"),
    });
    const dto = {
      name: "Jane",
      phone: "+51999000111",
      productId: "product-1",
      variantId: "variant-1",
    };

    await controller.create("myshop", dto);

    expect(service.create).toHaveBeenCalledWith("myshop", dto);
  });

  it("list() delegates to service.listForStore with the session user id", async () => {
    service.listForStore.mockResolvedValue([]);
    const session = { user: { id: "user-1" } } as never;

    await controller.list("store-1", session);

    expect(service.listForStore).toHaveBeenCalledWith("store-1", "user-1");
  });

  it("count() delegates to service.count with the session user id", () => {
    const session = { user: { id: "user-1" } } as never;

    controller.count("store-1", session);

    expect(service.count).toHaveBeenCalledWith("store-1", "user-1");
  });
});
