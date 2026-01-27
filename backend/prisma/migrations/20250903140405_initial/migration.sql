-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT,
    "exaggeration" REAL NOT NULL,
    "temperature" REAL NOT NULL,
    "seedNum" INTEGER NOT NULL,
    "cfgWeight" REAL NOT NULL,
    "minP" REAL NOT NULL,
    "topP" REAL NOT NULL,
    "repetitionPenalty" REAL NOT NULL,
    "totalDialogues" INTEGER NOT NULL DEFAULT 0,
    "audioFilesGenerated" INTEGER NOT NULL DEFAULT 0,
    "allSuccessful" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "dialogues" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "character" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dialogues_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audio_files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "dialogueId" TEXT,
    "filename" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "duration" REAL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    CONSTRAINT "audio_files_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "audio_files_dialogueId_fkey" FOREIGN KEY ("dialogueId") REFERENCES "dialogues" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "audio_files_dialogueId_key" ON "audio_files"("dialogueId");

-- CreateIndex
CREATE UNIQUE INDEX "audio_files_filePath_key" ON "audio_files"("filePath");
