-- CreateTable
CREATE TABLE "Highlight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "snoozeHistory" TEXT,
    "nextShowDate" DATETIME,
    "firstSeen" DATETIME NOT NULL,
    "lastUpdated" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GeneratedImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryHash" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "documentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Metadata" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Highlight_status_idx" ON "Highlight"("status");

-- CreateIndex
CREATE INDEX "Highlight_nextShowDate_idx" ON "Highlight"("nextShowDate");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedImage_entryHash_key" ON "GeneratedImage"("entryHash");

-- CreateIndex
CREATE INDEX "GeneratedImage_entryHash_idx" ON "GeneratedImage"("entryHash");
