CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "BackgroundJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "subjectMain" TEXT NOT NULL,
    "subjectSub" TEXT NOT NULL DEFAULT 'Module',
    "itemId" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE IF NOT EXISTS "SRSItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectMain" TEXT NOT NULL,
    "subjectSub" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tutorPromptDocId" TEXT,
    "tutorPromptContent" TEXT,
    "semester" INTEGER NOT NULL DEFAULT 1,
    "currentLevel" INTEGER NOT NULL DEFAULT 0,
    "nextReviewDate" DATETIME NOT NULL,
    "quiz1DocId" TEXT,
    "quiz2DocId" TEXT,
    "quiz3DocId" TEXT,
    "quiz4DocId" TEXT,
    "quiz5DocId" TEXT,
    "sourceMaterialId" TEXT,
    "sourceMaterialContent" TEXT,
    "lastFeedback" TEXT,
    "lastVideoPrompt1" TEXT,
    "lastVideoPrompt2" TEXT,
    "notebookId" TEXT,
    "prePodcastPrompt" TEXT,
    "postPodcastPrompt" TEXT,
    "prePodcastUrl" TEXT,
    "postPodcastUrl" TEXT,
    "videoUrl" TEXT,
    "userId" TEXT, "blueprint" TEXT, "coverageLedger" TEXT, "quiz6DocId" TEXT, "quiz7DocId" TEXT,
    CONSTRAINT "SRSItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "ReviewLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectMain" TEXT NOT NULL,
    "subjectSub" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    CONSTRAINT "ReviewLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "AppConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "currentSemester" INTEGER NOT NULL DEFAULT 1,
    "modulePresets" TEXT NOT NULL DEFAULT '[]',
    "language" TEXT NOT NULL DEFAULT 'german',
    "updatedAt" DATETIME NOT NULL
);
