-- Skills a course builds (with a pass mark each), and the content a learner's
-- results add to their plan. Additive: no existing column or row changes.

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "skills" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "PlanItem" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "reason" JSONB NOT NULL,
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanItem_itemId_idx" ON "PlanItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanItem_enrollmentId_itemId_key" ON "PlanItem"("enrollmentId", "itemId");

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CourseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
