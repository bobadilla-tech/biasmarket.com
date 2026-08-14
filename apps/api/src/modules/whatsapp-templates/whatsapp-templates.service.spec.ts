import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { type Mock, vi } from "vitest";
import { WhatsappTemplatesService } from "./whatsapp-templates.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";

describe("WhatsappTemplatesService", () => {
  let service: WhatsappTemplatesService;
  let prisma: {
    store: { findUnique: Mock };
    whatsAppMessageTemplate: { findUnique: Mock; upsert: Mock };
  };

  const storeId = "store-1";
  const userId = "user-1";

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      whatsAppMessageTemplate: { findUnique: vi.fn(), upsert: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappTemplatesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(WhatsappTemplatesService);
    prisma.store.findUnique.mockResolvedValue({
      id: storeId,
      ownerId: userId,
    });
  });

  it("throws NotFoundException when the store does not exist", async () => {
    prisma.store.findUnique.mockResolvedValue(null);

    await expect(
      service.findForStore(storeId, userId, "NEW_ORDER"),
    ).rejects.toThrow();
  });

  it("throws ForbiddenException when the user does not own the store", async () => {
    await expect(
      service.findForStore(storeId, "other-user", "NEW_ORDER"),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects an unknown message type", async () => {
    await expect(
      service.findForStore(storeId, userId, "ORDER_INQUIRY"),
    ).rejects.toThrow(BadRequestException);
  });

  it("returns the stored template or null when no override exists", async () => {
    prisma.whatsAppMessageTemplate.findUnique.mockResolvedValue(null);
    expect(await service.findForStore(storeId, userId, "NEW_ORDER")).toBeNull();

    const row = {
      id: "tmpl-1",
      storeId,
      type: "NEW_ORDER",
      template: "Hola {{customerName}}",
      updatedAt: new Date(),
    };
    prisma.whatsAppMessageTemplate.findUnique.mockResolvedValue(row);
    expect(await service.findForStore(storeId, userId, "NEW_ORDER")).toBe(row);
  });

  it("rejects a NEW_ORDER template missing a required token, naming the missing ones", async () => {
    const error = await service
      .upsert(storeId, userId, "NEW_ORDER", {
        template: "Solo {{items}}",
      })
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toContain("{{orderRef}}");
  });

  it("rejects a PAYMENT_REMINDER template missing pendingAmount", async () => {
    const error = await service
      .upsert(storeId, userId, "PAYMENT_REMINDER", {
        template: "Pedido {{orderRef}}",
      })
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toContain(
      "{{pendingAmount}}",
    );
  });

  it("accepts a template containing all required tokens", async () => {
    prisma.whatsAppMessageTemplate.upsert.mockResolvedValue({
      id: "tmpl-1",
      storeId,
      type: "NEW_ORDER",
      template: "Hola {{customerName}}, pedido {{orderRef}}, items {{items}}",
      updatedAt: new Date(),
    });

    const result = await service.upsert(storeId, userId, "NEW_ORDER", {
      template: "Hola {{customerName}}, pedido {{orderRef}}, items {{items}}",
    });

    expect(prisma.whatsAppMessageTemplate.upsert).toHaveBeenCalledWith({
      where: { storeId_type: { storeId, type: "NEW_ORDER" } },
      create: {
        storeId,
        type: "NEW_ORDER",
        template: "Hola {{customerName}}, pedido {{orderRef}}, items {{items}}",
      },
      update: {
        template: "Hola {{customerName}}, pedido {{orderRef}}, items {{items}}",
      },
    });
    expect(result.type).toBe("NEW_ORDER");
  });
});
