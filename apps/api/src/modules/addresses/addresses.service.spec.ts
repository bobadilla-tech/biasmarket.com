import { describe, expect, it, beforeEach } from "vitest";
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
      },
      $transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    service = new AddressesService(mockPrisma);
  });

  describe("findAllByCustomer", () => {
    it("returns addresses with ISO string dates", async () => {
      const createdAt = new Date();
      mockPrisma.address.findMany.mockResolvedValue([
        {
          id: "addr_1",
          customerId: "cust_1",
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

      const result = await service.findAllByCustomer("cust_1");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("addr_1");
      expect(result[0].createdAt).toBe(createdAt.toISOString());
      expect(mockPrisma.address.findMany).toHaveBeenCalledWith({
        where: { customerId: "cust_1" },
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
        customerId: "cust_1",
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

      const result = await service.create("cust_1", {
        label: "Casa",
        recipientName: "Maria",
        phone: "987654321",
        line1: "Av. Principal 123",
        city: "Lima",
      });

      expect(result.isDefault).toBe(true);
      expect(mockPrisma.address.updateMany).toHaveBeenCalledWith({
        where: { customerId: "cust_1" },
        data: { isDefault: false },
      });
    });
  });

  describe("update", () => {
    it("throws NotFoundException if address belongs to another customer", async () => {
      mockPrisma.address.findUnique.mockResolvedValue({
        id: "addr_1",
        customerId: "cust_2",
      });

      await expect(
        service.update("cust_1", "addr_1", { label: "Trabajo" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("delete", () => {
    it("deletes address and reassigns default if deleted address was default", async () => {
      mockPrisma.address.findUnique.mockResolvedValue({
        id: "addr_1",
        customerId: "cust_1",
        isDefault: true,
      });
      mockPrisma.address.delete.mockResolvedValue({});
      mockPrisma.address.findFirst.mockResolvedValue({
        id: "addr_2",
      });

      const result = await service.delete("cust_1", "addr_1");

      expect(result.success).toBe(true);
      expect(mockPrisma.address.delete).toHaveBeenCalledWith({
        where: { id: "addr_1" },
      });
      expect(mockPrisma.address.update).toHaveBeenCalledWith({
        where: { id: "addr_2" },
        data: { isDefault: true },
      });
    });
  });
});
