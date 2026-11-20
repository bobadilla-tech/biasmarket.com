import { beforeEach, describe, expect, it } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { AddressesService } from "./addresses.service.js";

describe("AddressesService", () => {
  let service: AddressesService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      address: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
      buyerAccount: {
        findUnique: vi.fn().mockResolvedValue({
          id: "buyer_1",
          phone: "+51987654321",
          pendingPhone: null,
          email: "buyer@example.com",
        }),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([{ id: "buyer_1" }]),
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    service = new AddressesService(mockPrisma);
  });

  describe("findAllByBuyerAccount", () => {
    it("returns addresses with ISO string dates", async () => {
      const createdAt = new Date();
      mockPrisma.address.findMany.mockResolvedValue([
        {
          id: "addr_1",
          buyerAccountId: "buyer_1",
          label: "Casa",
          recipientName: "Maria",
          phone: "987654321",
          line1: "Av. Principal 123",
          line2: null,
          city: "Lima",
          region: "Lima",
          reference: "Frente al parque",
          isDefault: true,
          createdAt,
        },
      ]);

      const result = await service.findAllByBuyerAccount("buyer_1");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("addr_1");
      expect(result[0].createdAt).toBe(createdAt.toISOString());
      expect(mockPrisma.address.findMany).toHaveBeenCalledWith({
        where: { buyerAccountId: "buyer_1" },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      });
    });
  });

  describe("create", () => {
    it("makes the first address default automatically", async () => {
      mockPrisma.address.count.mockResolvedValue(0);
      const createdAt = new Date();
      mockPrisma.address.create.mockResolvedValue({
        id: "addr_1",
        buyerAccountId: "buyer_1",
        label: "Casa",
        recipientName: "Maria",
        phone: "987654321",
        line1: "Av. Principal 123",
        line2: null,
        city: "Lima",
        region: null,
        reference: null,
        isDefault: true,
        createdAt,
      });

      const result = await service.create("buyer_1", {
        label: "Casa",
        recipientName: "Maria",
        phone: "987654321",
        line1: "Av. Principal 123",
        city: "Lima",
      });

      expect(result.isDefault).toBe(true);
      expect(mockPrisma.address.updateMany).toHaveBeenCalledWith({
        where: { buyerAccountId: "buyer_1" },
        data: { isDefault: false },
      });
    });
  });

  describe("update", () => {
    it("throws NotFoundException if address belongs to another buyer account", async () => {
      mockPrisma.address.findFirst.mockResolvedValue(null);

      await expect(
        service.update("buyer_1", "addr_1", { label: "Trabajo" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("delete", () => {
    it("deletes address and reassigns default if deleted address was default", async () => {
      mockPrisma.address.findFirst
        .mockResolvedValueOnce({
          id: "addr_1",
          buyerAccountId: "buyer_1",
          isDefault: true,
        })
        .mockResolvedValueOnce({ id: "addr_2" });
      mockPrisma.address.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.delete("buyer_1", "addr_1");

      expect(result.success).toBe(true);
      expect(mockPrisma.address.deleteMany).toHaveBeenCalledWith({
        where: { id: "addr_1", buyerAccountId: "buyer_1" },
      });
      expect(mockPrisma.address.update).toHaveBeenCalledWith({
        where: { id: "addr_2" },
        data: { isDefault: true },
      });
    });
  });
});
