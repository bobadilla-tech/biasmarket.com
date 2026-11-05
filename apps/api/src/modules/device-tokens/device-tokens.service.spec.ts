import { describe, expect, it, vi } from "vitest";
import { DeviceTokensService } from "./device-tokens.service.js";

describe("DeviceTokensService", () => {
  const prisma = {
    deviceToken: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  const service = new DeviceTokensService(prisma as never);

  it("transfers an existing device token to the authenticated owner", async () => {
    prisma.deviceToken.upsert.mockResolvedValue({
      id: "token-1",
      platform: "ios",
    });

    await service.register(
      { buyerAccountId: "buyer-1" },
      "ExpoPushToken[buyer-device-00000001]",
      "ios",
    );

    expect(prisma.deviceToken.upsert).toHaveBeenCalledWith({
      where: { expoPushToken: "ExpoPushToken[buyer-device-00000001]" },
      create: {
        userId: null,
        buyerAccountId: "buyer-1",
        expoPushToken: "ExpoPushToken[buyer-device-00000001]",
        platform: "ios",
      },
      update: {
        userId: null,
        buyerAccountId: "buyer-1",
        platform: "ios",
      },
      select: { id: true, platform: true },
    });
  });

  it("removes only the authenticated owner's token", async () => {
    prisma.deviceToken.deleteMany.mockResolvedValue({ count: 1 });

    await service.unregister(
      { userId: "seller-1" },
      "ExpoPushToken[seller-device-00000001]",
    );

    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "seller-1",
        expoPushToken: "ExpoPushToken[seller-device-00000001]",
      },
    });
  });
});
