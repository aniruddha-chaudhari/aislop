-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "totalDuration" REAL;

-- CreateTable
CREATE TABLE "subtitle_cache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sessionId" TEXT NOT NULL,
    "dialogueHash" TEXT NOT NULL,
    "assFilePath" TEXT NOT NULL,
    CONSTRAINT "subtitle_cache_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "subtitle_cache_sessionId_dialogueHash_key" ON "subtitle_cache"("sessionId", "dialogueHash");
