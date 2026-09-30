-- #593 CUID small bundle — SponsorshipPayment / AccountCode / JobPosting /
--                          LedgerEntry / RevenueAdjustment id Int → String
--
-- INTEGER → TEXT cast is implicit in PostgreSQL for `ALTER COLUMN ... SET DATA TYPE TEXT`.
-- FK constraints are dropped before column-type change and recreated after,
-- so referential integrity is preserved throughout the migration.
-- LedgerEntry.relatedId is polymorphic (points to Int or String ids of many
-- related resources); we normalise it to TEXT so it can hold both cuid and
-- legacy int values safely.

-- DropForeignKey
ALTER TABLE "JobApplication" DROP CONSTRAINT "JobApplication_postingId_fkey";

-- DropForeignKey
ALTER TABLE "LedgerEntry" DROP CONSTRAINT "LedgerEntry_accountCodeId_fkey";

-- DropForeignKey
ALTER TABLE "LedgerEntry" DROP CONSTRAINT "LedgerEntry_reversedById_fkey";

-- DropForeignKey
ALTER TABLE "OperatingExpense" DROP CONSTRAINT "OperatingExpense_accountCodeId_fkey";

-- DropForeignKey
ALTER TABLE "RevenueAdjustment" DROP CONSTRAINT "RevenueAdjustment_ledgerEntryId_fkey";

-- AlterTable
ALTER TABLE "AccountCode" DROP CONSTRAINT "AccountCode_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "AccountCode_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "AccountCode_id_seq";

-- AlterTable
ALTER TABLE "JobApplication" ALTER COLUMN "postingId" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "JobPosting" DROP CONSTRAINT "JobPosting_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "JobPosting_id_seq";

-- AlterTable
ALTER TABLE "LedgerEntry" DROP CONSTRAINT "LedgerEntry_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "relatedId" SET DATA TYPE TEXT,
ALTER COLUMN "accountCodeId" SET DATA TYPE TEXT,
ALTER COLUMN "reversedById" SET DATA TYPE TEXT,
ADD CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "LedgerEntry_id_seq";

-- AlterTable
ALTER TABLE "OperatingExpense" ALTER COLUMN "accountCodeId" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "RevenueAdjustment" DROP CONSTRAINT "RevenueAdjustment_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "ledgerEntryId" SET DATA TYPE TEXT,
ADD CONSTRAINT "RevenueAdjustment_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "RevenueAdjustment_id_seq";

-- AlterTable
ALTER TABLE "SponsorshipPayment" DROP CONSTRAINT "SponsorshipPayment_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "SponsorshipPayment_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "SponsorshipPayment_id_seq";

-- AddForeignKey
ALTER TABLE "OperatingExpense" ADD CONSTRAINT "OperatingExpense_accountCodeId_fkey" FOREIGN KEY ("accountCodeId") REFERENCES "AccountCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "JobPosting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountCodeId_fkey" FOREIGN KEY ("accountCodeId") REFERENCES "AccountCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueAdjustment" ADD CONSTRAINT "RevenueAdjustment_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
