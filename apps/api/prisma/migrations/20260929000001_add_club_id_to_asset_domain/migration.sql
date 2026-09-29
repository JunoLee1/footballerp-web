-- AlterTable: add clubId to EquipmentItem
ALTER TABLE "public"."EquipmentItem" ADD COLUMN "clubId" INTEGER;

-- AlterTable: add clubId to EquipmentUnit
ALTER TABLE "public"."EquipmentUnit" ADD COLUMN "clubId" INTEGER;

-- AlterTable: add clubId to EquipmentLoan
ALTER TABLE "public"."EquipmentLoan" ADD COLUMN "clubId" INTEGER;

-- AlterTable: add clubId to AssetRequest
ALTER TABLE "public"."AssetRequest" ADD COLUMN "clubId" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."EquipmentItem" ADD CONSTRAINT "EquipmentItem_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."EquipmentUnit" ADD CONSTRAINT "EquipmentUnit_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."EquipmentLoan" ADD CONSTRAINT "EquipmentLoan_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."AssetRequest" ADD CONSTRAINT "AssetRequest_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "public"."Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "AssetRequest_clubId_status_idx" ON "public"."AssetRequest"("clubId", "status");

-- Q1: Partner 는 clubId 없는 글로벌 엔티티 → Partner→clubId 우회 불가
-- Q2: 결정적 pivot 있는 3개는 각자, EquipmentItem 만 Prospect precedent (LIMIT 1) fallback

-- AssetRequest: 요청자(User) 소속 클럽 (OperatingExpense.createdBy 와 동일 패턴)
UPDATE "public"."AssetRequest" ar
SET "clubId" = u."clubId"
FROM "public"."User" u
WHERE ar."requesterId" = u."id" AND u."clubId" IS NOT NULL;

-- EquipmentLoan: 요청자(User) 소속 클럽
UPDATE "public"."EquipmentLoan" el
SET "clubId" = u."clubId"
FROM "public"."User" u
WHERE el."requestedById" = u."id" AND u."clubId" IS NOT NULL;

-- EquipmentItem: 첫 loan 요청자 clubId, 없으면 first Club LIMIT 1 (Prospect precedent)
UPDATE "public"."EquipmentItem" ei
SET "clubId" = COALESCE(
  (SELECT u."clubId" FROM "public"."EquipmentLoan" el
   JOIN "public"."User" u ON el."requestedById" = u."id"
   WHERE el."equipmentItemId" = ei."id" AND u."clubId" IS NOT NULL
   ORDER BY el."requestedAt" ASC LIMIT 1),
  (SELECT "id" FROM "public"."Club" ORDER BY "id" LIMIT 1)
);

-- EquipmentUnit: parent EquipmentItem 의 clubId 로 backfill
UPDATE "public"."EquipmentUnit" eu
SET "clubId" = ei."clubId"
FROM "public"."EquipmentItem" ei
WHERE eu."equipmentItemId" = ei."id" AND ei."clubId" IS NOT NULL;
