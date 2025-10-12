-- CreateTable
CREATE TABLE "Book" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "readableTitle" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "coverImageUrl" TEXT NOT NULL,
    "uniqueUrl" TEXT,
    "summary" TEXT,
    "bookTags" TEXT,
    "category" TEXT NOT NULL,
    "documentNote" TEXT,
    "readwiseUrl" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "asin" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Highlight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL DEFAULT '',
    "location" INTEGER,
    "locationType" TEXT NOT NULL DEFAULT 'page',
    "note" TEXT,
    "color" TEXT,
    "highlightedAt" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    "externalId" TEXT,
    "endLocation" INTEGER,
    "url" TEXT,
    "tags" TEXT,
    "isFavorite" BOOLEAN,
    "isDiscard" BOOLEAN,
    "readwiseUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "snoozeHistory" TEXT,
    "nextShowDate" DATETIME,
    "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bookId" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Highlight_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Highlight" ("firstSeen", "id", "lastUpdated", "nextShowDate", "snoozeHistory", "status") SELECT "firstSeen", "id", "lastUpdated", "nextShowDate", "snoozeHistory", "status" FROM "Highlight";
DROP TABLE "Highlight";
ALTER TABLE "new_Highlight" RENAME TO "Highlight";
CREATE INDEX "Highlight_status_idx" ON "Highlight"("status");
CREATE INDEX "Highlight_nextShowDate_idx" ON "Highlight"("nextShowDate");
CREATE INDEX "Highlight_bookId_idx" ON "Highlight"("bookId");
CREATE INDEX "Highlight_highlightedAt_idx" ON "Highlight"("highlightedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Book_category_idx" ON "Book"("category");

-- CreateIndex
CREATE INDEX "Book_updatedAt_idx" ON "Book"("updatedAt");
