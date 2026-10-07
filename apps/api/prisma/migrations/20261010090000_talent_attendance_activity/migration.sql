-- Talent management, attendance and activity logs (#69). Additive only.

-- AlterTable
ALTER TABLE "Cohort" ADD COLUMN     "delivery" TEXT NOT NULL DEFAULT 'online';

-- CreateTable
CREATE TABLE "ParticipantNote" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cohortId" TEXT,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParticipantNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportItem" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cohortId" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "dueDate" TIMESTAMP(3),
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentProfile" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeKey" TEXT,
    "resumeName" TEXT,
    "resumeSize" INTEGER,
    "resumeUploadedAt" TIMESTAMP(3),
    "educationLevel" TEXT,
    "fieldOfStudy" TEXT,
    "school" TEXT,
    "graduationYear" INTEGER,
    "yearsExperience" INTEGER,
    "industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "previousCompensation" INTEGER,
    "targetCompensation" INTEGER,
    "targetRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "availableFrom" TIMESTAMP(3),
    "shareWithEmployers" BOOLEAN NOT NULL DEFAULT false,
    "consentUpdatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataAccessLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "subjectUserId" TEXT,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CohortSession" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "location" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CohortSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceMark" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "markedBy" TEXT NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivitySession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "itemId" TEXT,
    "kind" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "estimated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ActivitySession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParticipantNote_providerId_userId_createdAt_idx" ON "ParticipantNote"("providerId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportItem_providerId_userId_idx" ON "SupportItem"("providerId", "userId");

-- CreateIndex
CREATE INDEX "SupportItem_providerId_status_dueDate_idx" ON "SupportItem"("providerId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "TalentProfile_userId_idx" ON "TalentProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TalentProfile_providerId_userId_key" ON "TalentProfile"("providerId", "userId");

-- CreateIndex
CREATE INDEX "DataAccessLog_providerId_createdAt_idx" ON "DataAccessLog"("providerId", "createdAt");

-- CreateIndex
CREATE INDEX "DataAccessLog_providerId_subjectUserId_createdAt_idx" ON "DataAccessLog"("providerId", "subjectUserId", "createdAt");

-- CreateIndex
CREATE INDEX "DataAccessLog_actorId_createdAt_idx" ON "DataAccessLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "CohortSession_cohortId_startsAt_idx" ON "CohortSession"("cohortId", "startsAt");

-- CreateIndex
CREATE INDEX "AttendanceMark_userId_idx" ON "AttendanceMark"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceMark_sessionId_userId_key" ON "AttendanceMark"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "ActivitySession_enrollmentId_day_itemId_idx" ON "ActivitySession"("enrollmentId", "day", "itemId");

-- CreateIndex
CREATE INDEX "ActivitySession_userId_day_idx" ON "ActivitySession"("userId", "day");

-- CreateIndex
CREATE INDEX "ActivitySession_itemId_idx" ON "ActivitySession"("itemId");

-- AddForeignKey
ALTER TABLE "ParticipantNote" ADD CONSTRAINT "ParticipantNote_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantNote" ADD CONSTRAINT "ParticipantNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantNote" ADD CONSTRAINT "ParticipantNote_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportItem" ADD CONSTRAINT "SupportItem_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportItem" ADD CONSTRAINT "SupportItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportItem" ADD CONSTRAINT "SupportItem_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentProfile" ADD CONSTRAINT "TalentProfile_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentProfile" ADD CONSTRAINT "TalentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortSession" ADD CONSTRAINT "CohortSession_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceMark" ADD CONSTRAINT "AttendanceMark_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CohortSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceMark" ADD CONSTRAINT "AttendanceMark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySession" ADD CONSTRAINT "ActivitySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySession" ADD CONSTRAINT "ActivitySession_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySession" ADD CONSTRAINT "ActivitySession_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CourseItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

