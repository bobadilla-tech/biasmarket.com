-- CreateTable
CREATE TABLE "PlatformIncident" (
    "id" TEXT NOT NULL,
    "monitorId" INTEGER NOT NULL,
    "monitorName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PlatformIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformIncident_monitorId_resolvedAt_idx" ON "PlatformIncident"("monitorId", "resolvedAt");
