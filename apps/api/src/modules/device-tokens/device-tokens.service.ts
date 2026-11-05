import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";

type TokenOwner = { userId?: string; buyerAccountId?: string };

@Injectable()
export class DeviceTokensService {
  constructor(private prisma: PrismaService) {}

  async register(
    owner: TokenOwner,
    expoPushToken: string,
    platform: "ios" | "android",
  ) {
    return this.prisma.deviceToken.upsert({
      where: { expoPushToken },
      create: {
        userId: null,
        buyerAccountId: null,
        ...owner,
        expoPushToken,
        platform,
      },
      update: { userId: null, buyerAccountId: null, ...owner, platform },
      select: { id: true, platform: true },
    });
  }

  async unregister(owner: TokenOwner, expoPushToken: string) {
    return this.prisma.deviceToken.deleteMany({
      where: { ...owner, expoPushToken },
    });
  }

  async removeInvalidToken(expoPushToken: string) {
    return this.prisma.deviceToken.deleteMany({ where: { expoPushToken } });
  }
}
