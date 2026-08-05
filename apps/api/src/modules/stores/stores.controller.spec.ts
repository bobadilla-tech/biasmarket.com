import { Test, TestingModule } from "@nestjs/testing";
import { type Mock, vi } from "vitest";
import { StoresController } from "./stores.controller.js";
import { StoresService } from "./stores.service.js";
import { StorageService } from "../../storage/storage.service.js";

vi.mock("@thallesp/nestjs-better-auth", () => ({
  AuthGuard: class AuthGuard {},
  Session: () => () => undefined,
  Public: () => () => undefined,
  Roles: () => () => undefined,
}));

describe("StoresController", () => {
  let controller: StoresController;
  let service: { create: Mock };

  beforeEach(async () => {
    service = { create: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StoresController],
      providers: [
        { provide: StoresService, useValue: service },
        { provide: StorageService, useValue: { uploadImage: vi.fn() } },
      ],
    }).compile();

    controller = module.get<StoresController>(StoresController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("create() delegates to service.create with userId and the dto", async () => {
    const session = { user: { id: "user-1" } } as never;
    const dto = {
      name: "My Store",
      slug: "my-store",
      whatsappNumber: "+51999999999",
    };
    service.create.mockResolvedValue({
      id: "store-1",
      name: "My Store",
      slug: "my-store",
      locale: "es",
      ownerId: "user-1",
      themeConfig: {},
      logoUrl: null,
      paymentInstructions: "",
      whatsappNumber: "+51999999999",
      defaultCurrency: "PEN",
      holdWindowHours: 48,
      lowStockThreshold: 5,
      lowStockAlertsEnabled: true,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    });

    await controller.create(session, dto);

    expect(service.create).toHaveBeenCalledWith("user-1", dto);
  });
});
