import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { PrismaClient } from "@biasmarket/db";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizePhone } from "@biasmarket/utils/phone-country";

const migrationsDir = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
  "..",
  "packages",
  "db",
  "prisma",
  "migrations",
);
const readMigration = (name: string) =>
  readFileSync(join(migrationsDir, name, "migration.sql"), "utf-8");

const backfill = readMigration(
  "20261023210100_backfill_order_customer_phone_normalized",
);
const repair = readMigration(
  "20261027120000_repair_order_customer_phone_normalized_00_prefix",
);

// The backfill SQL hand-mirrors normalizePhone. Run the migration files
// verbatim against a TEMP "Order" table (shadows the real one for this
// session, nothing is persisted) and compare with the util, so the two
// cannot drift unnoticed.
const PHONES = [
  "+51987654321",
  "987654321",
  "51987654321",
  "+51 987 654 321",
  "+593991234567",
  "593991234567",
  "+1 (415) 555-0100",
  "14155550100",
  "+34 681 234 567",
  "0051987654321",
  "00 51 987654321",
  "+0051987654321",
  "0034 681234567",
  "00593991234567",
  "0044 7911 123456",
  "0051",
  "00",
];

describe("customerPhoneNormalized backfill vs normalizePhone (e2e)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
  });
  afterAll(() => prisma.$disconnect());

  it("matches normalizePhone for every phone shape once the repair has run", async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `CREATE TEMP TABLE "Order" ("id" text PRIMARY KEY, "customerPhone" text NOT NULL, "customerPhoneNormalized" text) ON COMMIT DROP`,
      );
      for (const [i, phone] of PHONES.entries()) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "Order" ("id", "customerPhone") VALUES ($1, $2)`,
          `o${i}`,
          phone,
        );
      }

      await tx.$executeRawUnsafe(backfill);
      await tx.$executeRawUnsafe(repair);

      const rows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          customerPhone: string;
          customerPhoneNormalized: string;
        }>
      >(`SELECT * FROM "Order" ORDER BY "id"`);
      const actual = Object.fromEntries(
        rows.map((r) => [r.customerPhone, r.customerPhoneNormalized]),
      );
      const expected = Object.fromEntries(
        PHONES.map((p) => [p, normalizePhone(p)]),
      );
      expect(actual).toEqual(expected);
    });
  });
});
