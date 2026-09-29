-- Issue #551: EquipmentLoan 반납기한(dueDate) + 연체 알림 중복 방지(overdueNotifiedAt)
--
-- 1) overdueNotifiedAt: cron 이 하루 한 번 대상자에게 알림 발송했음을 표시 → 중복 방지.
-- 2) dueDate NOT NULL: 기존 legacy row 는 issuedAt+30d (없으면 requestedAt+30d) 로 backfill.
--    이후 신규 대여는 controller/service 레벨에서 반드시 dueDate 를 받도록 강제.

ALTER TABLE "public"."EquipmentLoan"
  ADD COLUMN "overdueNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "dueDate" TIMESTAMP(3);

UPDATE "public"."EquipmentLoan"
SET "dueDate" = COALESCE("issuedAt", "requestedAt") + INTERVAL '30 days'
WHERE "dueDate" IS NULL;

ALTER TABLE "public"."EquipmentLoan"
  ALTER COLUMN "dueDate" SET NOT NULL;

CREATE INDEX "EquipmentLoan_status_dueDate_idx"
  ON "public"."EquipmentLoan" ("status", "dueDate");
