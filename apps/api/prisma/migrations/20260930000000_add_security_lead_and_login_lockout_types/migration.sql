-- #574: LOGIN_LOCKOUT_24H NotificationType 부재로 20회 로그인 실패 시
-- ADMIN 알림이 Prisma validation error 로 실패하고 있었음. TESTTODO Section 1
-- 에 기재된 기능이 실제로는 코드 도달만 하고 DB write 는 실패하는 hidden bug.
-- 또한 보안 담당팀장 (SECURITY_LEAD FrontOfficeRole) 을 신설하여 브루트포스
-- 알림을 ADMIN 뿐 아니라 보안 담당자에게도 병렬 발송하도록 확장.

ALTER TYPE "public"."NotificationType" ADD VALUE IF NOT EXISTS 'LOGIN_LOCKOUT_24H';
ALTER TYPE "public"."FrontOfficeRole" ADD VALUE IF NOT EXISTS 'SECURITY_LEAD';
