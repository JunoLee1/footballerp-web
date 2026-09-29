-- Phase 2.5 · Q5: User.clubId legacy backfill
--
-- SUPER_ADMIN 은 platform-level 계정으로 특정 club 에 소속되지 않음 → 제외.
-- 나머지 role 중 clubId null 인 legacy 유저를 first Club (Phase 1 Prospect precedent) 으로 세팅.
-- 현재 prod 단일 클럽 확인됨 → LIMIT 1 fallback 안전.
--
-- 이 마이그레이션은 현재 상태에서 no-op 인 경우가 많으나 (36/37 이미 clubId 세팅됨),
-- 미래에 legacy 유저 유입 시 안전망 목적.

UPDATE "public"."User"
SET "clubId" = (SELECT "id" FROM "public"."Club" ORDER BY "id" LIMIT 1)
WHERE "clubId" IS NULL
  AND "role" != 'SUPER_ADMIN';
