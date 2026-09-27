import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { getRedisClient } from "./cache";

// Progressive login lockout tiers — 실패 횟수 누적 시 잠금 기간 승격.
// 5회 → 5분 · 10회 → 30분 · 15회 → 1시간 · 20회 → 24시간.
// 배열은 threshold 내림차순: 가장 높은 tier 부터 매칭.
const TIERS: ReadonlyArray<{ attempts: number; lockoutSec: number; label: string }> = [
  { attempts: 20, lockoutSec: 24 * 60 * 60, label: "24h" },
  { attempts: 15, lockoutSec: 60 * 60, label: "1h" },
  { attempts: 10, lockoutSec: 30 * 60, label: "30m" },
  { attempts: 5, lockoutSec: 5 * 60, label: "5m" },
];

// 카운터는 24시간 후 자동 만료 (가장 높은 tier 와 동일).
const COUNTER_TTL_SEC = 24 * 60 * 60;

function hashEmail(email: string): string {
  return crypto.createHash("sha256").update(email.toLowerCase().trim()).digest("hex").slice(0, 16);
}

function counterKey(ip: string, email: string): string {
  return `login-attempts:${ip}:${hashEmail(email)}`;
}

function lockKey(ip: string, email: string): string {
  return `login-lock:${ip}:${hashEmail(email)}`;
}

export async function checkLockout(
  ip: string,
  email: string,
): Promise<{ retryAfterSec: number; tier: string } | null> {
  const client = getRedisClient();
  if (!client) return null;
  try {
    const [ttl, tier] = await Promise.all([
      client.ttl(lockKey(ip, email)),
      client.get(`${lockKey(ip, email)}:tier`),
    ]);
    if (ttl > 0) return { retryAfterSec: ttl, tier: tier ?? "unknown" };
    return null;
  } catch {
    return null;
  }
}

export async function recordFailedAttempt(ip: string, email: string): Promise<{ attempts: number; lockedTier?: string }> {
  const client = getRedisClient();
  if (!client) return { attempts: 0 };
  try {
    const key = counterKey(ip, email);
    const attempts = await client.incr(key);
    // 첫 실패 시 카운터 TTL 설정 (24h 후 자동 리셋).
    if (attempts === 1) await client.expire(key, COUNTER_TTL_SEC);
    // 도달한 최상위 tier 찾기 (배열은 내림차순).
    const tier = TIERS.find((t) => attempts >= t.attempts);
    if (tier) {
      await client.set(lockKey(ip, email), "1", "EX", tier.lockoutSec);
      await client.set(`${lockKey(ip, email)}:tier`, tier.label, "EX", tier.lockoutSec);
      return { attempts, lockedTier: tier.label };
    }
    return { attempts };
  } catch {
    return { attempts: 0 };
  }
}

export async function resetAttempts(ip: string, email: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  try {
    await client.del(counterKey(ip, email), lockKey(ip, email), `${lockKey(ip, email)}:tier`);
  } catch {
    /* ignore */
  }
}

// Express 미들웨어 — request.body.email 기반으로 lockout 조회하여 429 반환.
// 카운터 갱신은 controller/service 에서 로그인 성공·실패 분기 후 호출.
export async function loginLockoutMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  if (!email || typeof email !== "string") {
    next();
    return;
  }
  const ip = req.ip ?? "unknown";
  const lockout = await checkLockout(ip, email);
  if (lockout) {
    res.setHeader("Retry-After", String(lockout.retryAfterSec));
    res.status(429).json({
      code: "TOO_MANY_REQUESTS",
      retryAfterSec: lockout.retryAfterSec,
      tier: lockout.tier,
    });
    return;
  }
  next();
}

// 테스트/디버그용: 현재 상태 조회 (attempts 카운터 + lock 상태).
export async function getLockoutState(
  ip: string,
  email: string,
): Promise<{ attempts: number; retryAfterSec: number | null; tier: string | null }> {
  const client = getRedisClient();
  if (!client) return { attempts: 0, retryAfterSec: null, tier: null };
  const [attemptsRaw, ttl, tier] = await Promise.all([
    client.get(counterKey(ip, email)),
    client.ttl(lockKey(ip, email)),
    client.get(`${lockKey(ip, email)}:tier`),
  ]);
  return {
    attempts: attemptsRaw ? Number(attemptsRaw) : 0,
    retryAfterSec: ttl > 0 ? ttl : null,
    tier: tier ?? null,
  };
}
