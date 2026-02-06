-- CreateTable
CREATE TABLE "sfx_assets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL UNIQUE,
    "description" TEXT NOT NULL,
    "durationText" TEXT,
    "durationSeconds" REAL,
    "filePath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
