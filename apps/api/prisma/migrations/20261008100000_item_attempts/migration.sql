-- One row per counted score a connected tool sent back (#67). Additive: a new table.

-- CreateTable
CREATE TABLE "ItemAttempt" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "reportedAt" TIMESTAMP(3),
    "dimensions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemAttempt_enrollmentId_itemId_createdAt_idx" ON "ItemAttempt"("enrollmentId", "itemId", "createdAt");

-- AddForeignKey
ALTER TABLE "ItemAttempt" ADD CONSTRAINT "ItemAttempt_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemAttempt" ADD CONSTRAINT "ItemAttempt_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CourseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
