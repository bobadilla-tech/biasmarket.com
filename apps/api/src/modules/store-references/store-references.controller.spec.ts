import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { StoreReferencesController } from "./store-references.controller.js";

describe("StoreReferencesController", () => {
  const reference = {
    id: "reference-1",
    takenAt: new Date("2026-10-01T00:00:00.000Z"),
    createdAt: new Date("2026-10-02T00:00:00.000Z"),
  };

  function createController() {
    const references = {
      setHidden: vi.fn().mockResolvedValue(reference),
      findPublic: vi.fn().mockResolvedValue({
        items: [reference],
        total: 1,
        page: 1,
        limit: 24,
      }),
    };
    const storage = { deleteImage: vi.fn() };
    return {
      controller: new StoreReferencesController(
        references as never,
        storage as never,
      ),
      references,
    };
  }

  it.each([
    ["hide", true],
    ["unhide", false],
  ] as const)(
    "%s delegates the admin action to the service",
    async (action, hidden) => {
      const { controller, references } = createController();

      await controller[action]("reference-1", {
        user: { id: "admin-1" },
      } as never);

      expect(references.setHidden).toHaveBeenCalledWith(
        "reference-1",
        "admin-1",
        hidden,
      );
    },
  );

  it.each(["202", "9007199254740992"])(
    "rejects unsafe or unreachable public reference page %s",
    async (page) => {
      const { controller, references } = createController();

      await expect(
        controller.findPublic("store", "recientes", page, "24"),
      ).rejects.toThrow(BadRequestException);
      expect(references.findPublic).not.toHaveBeenCalled();
    },
  );
});
