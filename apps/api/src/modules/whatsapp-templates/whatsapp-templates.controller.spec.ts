import { Test, TestingModule } from "@nestjs/testing";
import { type Mock, vi } from "vitest";
import { WhatsappTemplatesController } from "./whatsapp-templates.controller.js";
import { WhatsappTemplatesService } from "./whatsapp-templates.service.js";

vi.mock("@thallesp/nestjs-better-auth", () => ({
  AuthGuard: class AuthGuard {},
  Session: () => () => undefined,
}));

describe("WhatsappTemplatesController", () => {
  let controller: WhatsappTemplatesController;
  let service: { findForStore: Mock; upsert: Mock };

  beforeEach(async () => {
    service = {
      findForStore: vi.fn(),
      upsert: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappTemplatesController],
      providers: [{ provide: WhatsappTemplatesService, useValue: service }],
    }).compile();

    controller = module.get<WhatsappTemplatesController>(
      WhatsappTemplatesController,
    );
  });

  it("findOne() delegates to service.findForStore and serializes dates", async () => {
    const updatedAt = new Date("2026-08-09T12:00:00.000Z");
    service.findForStore.mockResolvedValue({
      id: "tmpl-1",
      storeId: "store-1",
      type: "NEW_ORDER",
      template: "Hola {{customerName}}",
      updatedAt,
    });
    const session = { user: { id: "user-1" } } as never;

    const result = await controller.findOne("store-1", "NEW_ORDER", session);

    expect(service.findForStore).toHaveBeenCalledWith(
      "store-1",
      "user-1",
      "NEW_ORDER",
    );
    expect(result?.updatedAt).toBe("2026-08-09T12:00:00.000Z");
  });

  it("findOne() returns null when the service returns null (no override)", async () => {
    service.findForStore.mockResolvedValue(null);
    const session = { user: { id: "user-1" } } as never;

    expect(
      await controller.findOne("store-1", "NEW_ORDER", session),
    ).toBeNull();
  });

  it("upsert() delegates to service.upsert and serializes dates", async () => {
    const updatedAt = new Date("2026-08-09T12:00:00.000Z");
    service.upsert.mockResolvedValue({
      id: "tmpl-1",
      storeId: "store-1",
      type: "PAYMENT_REMINDER",
      template: "Hola {{orderRef}}",
      updatedAt,
    });
    const session = { user: { id: "user-1" } } as never;
    const dto = { template: "Hola {{orderRef}} {{pendingAmount}}" };

    const result = await controller.upsert(
      "store-1",
      "PAYMENT_REMINDER",
      session,
      dto,
    );

    expect(service.upsert).toHaveBeenCalledWith(
      "store-1",
      "user-1",
      "PAYMENT_REMINDER",
      dto,
    );
    expect(result?.updatedAt).toBe("2026-08-09T12:00:00.000Z");
  });
});
