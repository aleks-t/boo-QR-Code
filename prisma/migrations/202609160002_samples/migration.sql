-- Per-part physical sample tracking. Existing parts receive Sample 1.
CREATE TYPE "SampleStatus" AS ENUM ('IN_HOUSE', 'SENT_OUT', 'PASSED', 'FAILED', 'SENT_BACK');

CREATE TABLE "Sample" (
  "id" TEXT NOT NULL,
  "partId" TEXT NOT NULL,
  "sampleNumber" INTEGER NOT NULL,
  "status" "SampleStatus" NOT NULL DEFAULT 'IN_HOUSE',
  "note" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Sample_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SampleEvent" (
  "id" TEXT NOT NULL,
  "sampleId" TEXT NOT NULL,
  "status" "SampleStatus" NOT NULL,
  "note" TEXT,
  "revisionNum" INTEGER,
  "loggedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SampleEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Sample_partId_sampleNumber_key" ON "Sample"("partId", "sampleNumber");
CREATE INDEX "Sample_partId_status_idx" ON "Sample"("partId", "status");
CREATE INDEX "SampleEvent_sampleId_createdAt_idx" ON "SampleEvent"("sampleId", "createdAt");
ALTER TABLE "Sample" ADD CONSTRAINT "Sample_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SampleEvent" ADD CONSTRAINT "SampleEvent_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Sample" ("id", "partId", "sampleNumber", "updatedAt")
SELECT 'sample_' || "id", "id", 1, CURRENT_TIMESTAMP FROM "Part";
INSERT INTO "SampleEvent" ("id", "sampleId", "status", "loggedBy", "createdAt")
SELECT 'sample_event_' || "id", "id", 'IN_HOUSE', 'System', CURRENT_TIMESTAMP FROM "Sample";
