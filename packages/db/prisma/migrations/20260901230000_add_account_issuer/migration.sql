-- better-auth 1.7 adds `account.issuer` and keys credential/social accounts by
-- it: sign-in now matches the credential row on `issuer = 'local:credential'`
-- (see better-auth `createLocalAccountIssuer`), not `providerId` alone. Add the
-- column nullable, backfill every existing row, then enforce NOT NULL so old
-- accounts (all credential in this app — no social providers are configured)
-- keep working after the bump.

-- AlterTable
ALTER TABLE "account" ADD COLUMN "issuer" TEXT;

-- Data step: backfill. Credential rows -> 'local:credential'. Any other
-- providerId (none today, but keep this correct if a social provider is ever
-- added before this migration is retired) -> better-auth's 'local:oauth:<id>'.
UPDATE "account"
SET "issuer" = 'local:credential'
WHERE "providerId" = 'credential' AND "issuer" IS NULL;

UPDATE "account"
SET "issuer" = 'local:oauth:' || "providerId"
WHERE "providerId" <> 'credential' AND "issuer" IS NULL;

-- AlterTable
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "account_issuer_accountId_key" ON "account"("issuer", "accountId");
