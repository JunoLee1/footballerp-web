-- #551 drive-by: equipment.service 가 발송하려던 4개 NotificationType 이 enum 에
-- 존재하지 않아 request/approve/reject/return 시 알림 생성이 500 으로 실패하고 있었음.
-- 실제 스모크 테스트로 발견 — 유닛 테스트는 notification.create 를 mock 하고 있어 놓쳤음.

ALTER TYPE "public"."NotificationType" ADD VALUE IF NOT EXISTS 'EQUIPMENT_LOAN_REQUESTED';
ALTER TYPE "public"."NotificationType" ADD VALUE IF NOT EXISTS 'EQUIPMENT_LOAN_APPROVED';
ALTER TYPE "public"."NotificationType" ADD VALUE IF NOT EXISTS 'EQUIPMENT_LOAN_REJECTED';
ALTER TYPE "public"."NotificationType" ADD VALUE IF NOT EXISTS 'EQUIPMENT_LOAN_RETURNED';
