// 인증 미들웨어의 매-요청 `SELECT isDeleted FROM User` 부담 제거용 캐시.
// 로그인 성공 · 매 인증 성공 시 Redis 에 저장하고, admin.setDeleted 시 invalidate.

import { getRedisClient } from "./cache";
import { getPrisma } from "./prisma";

const KEY_PREFIX = "user:active:";
const TTL_SEC = 5 * 60; // 5분 — soft-delete 반영 최대 지연

/**
 * 유저 계정이 활성인지 (isDeleted === false) 확인.
 * Redis hit → 즉시 반환. miss → DB 조회 후 캐시 세팅.
 * Redis 불가 시 DB fallback (기존 동작).
 */
export async function isUserActive(userId: number): Promise<boolean> {
  const client = getRedisClient();
  const key = `${KEY_PREFIX}${userId}`;
  if (client) {
    try {
      const cached = await client.get(key);
      if (cached !== null) return cached === "1";
    } catch {
      /* fall through to DB */
    }
  }
  const record = await getPrisma().user.findUnique({
    where: { id: userId },
    select: { isDeleted: true },
  });
  const active = !!record && !record.isDeleted;
  if (client) {
    try {
      await client.set(key, active ? "1" : "0", "EX", TTL_SEC);
    } catch {
      /* ignore cache write failure */
    }
  }
  return active;
}

/**
 * 유저 활성 상태 변경 시 (setDeleted true/false, hardDelete) 캐시 무효화.
 */
export async function invalidateUserActive(userId: number): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  try {
    await client.del(`${KEY_PREFIX}${userId}`);
  } catch {
    /* ignore */
  }
}
