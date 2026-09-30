-- Additive only: keep every existing part, sample, revision and QR identifier.
-- Unknown historical sample versions/dates stay unset rather than being guessed.
ALTER TABLE "Sample" ADD COLUMN "revisionNum" INTEGER,
  ADD COLUMN "receivedOn" DATE,
  ADD COLUMN "labelPrinted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SampleEvent" ADD COLUMN "details" JSONB;
ALTER TABLE "Revision" ADD COLUMN "effectiveOn" DATE,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- A retried delivery request returns its original samples instead of duplicating them.
CREATE TABLE "Receipt" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);
