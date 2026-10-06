-- AlterTable
ALTER TABLE "Cohort" ADD COLUMN     "maxLearners" INTEGER;

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "outcomes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "targetRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];

