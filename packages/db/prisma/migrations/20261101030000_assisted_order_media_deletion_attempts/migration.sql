-- Track failed deletions so permanently failing rows cannot starve newer ones.
ALTER TABLE "AssistedOrderMediaDeletion"
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

DROP INDEX "AssistedOrderMediaDeletion_createdAt_idx";

CREATE INDEX "AssistedOrderMediaDeletion_attempts_createdAt_id_idx"
ON "AssistedOrderMediaDeletion"("attempts", "createdAt", "id");
