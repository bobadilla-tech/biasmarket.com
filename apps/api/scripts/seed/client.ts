import { PrismaClient } from "@biasmarket/db";
import { PrismaPg } from "@prisma/adapter-pg";

export function createSeedClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}
