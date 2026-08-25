-- AlterTable
ALTER TABLE "devices" ADD COLUMN "projectId" TEXT;

-- CreateIndex
CREATE INDEX "devices_projectId_isDeleted_idx" ON "devices"("projectId", "isDeleted");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
