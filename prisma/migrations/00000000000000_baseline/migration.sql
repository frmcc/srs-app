-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SRSItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectMain" TEXT NOT NULL,
    "subjectSub" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tutorPromptDocId" TEXT,
    "tutorPromptContent" TEXT,
    "semester" INTEGER NOT NULL DEFAULT 1,
    "currentLevel" INTEGER NOT NULL DEFAULT 0,
    "nextReviewDate" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "quiz1DocId" TEXT,
    "quiz2DocId" TEXT,
    "quiz3DocId" TEXT,
    "quiz4DocId" TEXT,
    "quiz5DocId" TEXT,
    "quiz6DocId" TEXT,
    "quiz7DocId" TEXT,
    "sourceMaterialId" TEXT,
    "sourceMaterialContent" TEXT,
    "blueprint" TEXT,
    "coverageLedger" TEXT,
    "lastFeedback" TEXT,
    "lastVideoPrompt1" TEXT,
    "lastVideoPrompt2" TEXT,
    "notebookId" TEXT,
    "prePodcastPrompt" TEXT,
    "postPodcastPrompt" TEXT,
    "prePodcastUrl" TEXT,
    "postPodcastUrl" TEXT,
    "videoUrl" TEXT,
    "comprehensionScore" REAL,
    "comprehensionPassed" BOOLEAN,
    "comprehensionAt" DATETIME,
    "comprehensionFeedback" TEXT,
    "comprehensionQuizText" TEXT,
    "userId" TEXT,
    CONSTRAINT "SRSItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "subjectMain" TEXT NOT NULL,
    "subjectSub" TEXT NOT NULL DEFAULT 'Module',
    "itemId" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "currentSemester" INTEGER NOT NULL DEFAULT 1,
    "modulePresets" TEXT NOT NULL DEFAULT '[]',
    "language" TEXT NOT NULL DEFAULT 'german',
    "wrapperMode" TEXT NOT NULL DEFAULT 'all',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReviewLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectMain" TEXT NOT NULL,
    "subjectSub" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "feedback" TEXT,
    "itemId" TEXT,
    "userId" TEXT,
    CONSTRAINT "ReviewLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "SRSItem_nextReviewDate_idx" ON "SRSItem"("nextReviewDate");

-- CreateIndex
CREATE INDEX "SRSItem_subjectMain_idx" ON "SRSItem"("subjectMain");

-- CreateIndex
CREATE INDEX "SRSItem_tutorPromptDocId_idx" ON "SRSItem"("tutorPromptDocId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "BackgroundJob_status_createdAt_idx" ON "BackgroundJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewLog_itemId_idx" ON "ReviewLog"("itemId");

-- CreateIndex
CREATE INDEX "ReviewLog_completedAt_idx" ON "ReviewLog"("completedAt");

