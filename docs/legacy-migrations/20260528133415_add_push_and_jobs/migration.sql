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
    "completedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
