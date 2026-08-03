import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getStoreCounts() {
    const groups = await this.prisma.store.groupBy({
      by: ["ownerId"],
      _count: true,
    });

    return groups.map((group) => ({
      userId: group.ownerId,
      storeCount: group._count,
    }));
  }
}
