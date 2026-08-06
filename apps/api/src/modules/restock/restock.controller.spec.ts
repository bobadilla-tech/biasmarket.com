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
  let service: { create: Mock; listForStore: Mock };

  beforeEach(async () => {
    service = {
      create: vi.fn(),
      listForStore: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RestockController],
      providers: [{ provide: RestockService, useValue: service }],
    }).compile();

    controller = module.get<RestockController>(RestockController);
  });

  it("create() delegates to service.create with slug and dto", () => {
    const dto = {
      name: "Jane",
      phone: "+51999000111",
      productId: "product-1",
      variantId: "variant-1",
    };

    controller.create("myshop", dto);

    expect(service.create).toHaveBeenCalledWith("myshop", dto);
  });

  it("list() delegates to service.listForStore with the session user id", () => {
    const session = { user: { id: "user-1" } } as never;

    controller.list("store-1", session);

    expect(service.listForStore).toHaveBeenCalledWith("store-1", "user-1");
  });
});
