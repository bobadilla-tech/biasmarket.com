import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@biasmarket/db";
import { PrismaPg } from "@prisma/adapter-pg";

const DB_TIMEOUT = 5000;

@Injectable()
export class PrismaService extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      // Prisma ORM v6 defaulted to a 5s connection timeout; the `pg` driver
      // has none by default, so set it explicitly to preserve that behavior.
      connectionTimeoutMillis: DB_TIMEOUT,
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
