import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

// #573: write endpoint mass-write 취약점 방어.
// admin 세션이라도 60초 이내에 IP 당 threshold 초과 시 429 반환.
//
// 배치 지점: apiRouter.use(writeRateLimit) 로 auth 이전에 실행됨.
// 이 시점에는 req.user 가 아직 설정 안 되어 있으므로 IP 기반으로만 판정한다.
// role 별 세밀한 threshold 는 향후 auth 이후에 걸리는 별도 미들웨어로 확장 예정.
//
// GET/HEAD/OPTIONS 는 skip — read 는 별도 캐시/threshold 로 관리.

const WINDOW_MS = 60 * 1000; // 1분
const IP_LIMIT = 60; // 정상 사용자 최대 (ADMIN 60 write/min 상한과 동일).

function skipForRead(req: Request): boolean {
  return req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
}

// Factory — 테스트 시 fresh instance 를 만들어야 counter store 격리 가능.
// 프로덕션은 아래 `writeRateLimit` singleton 을 apiRouter 에 1회 마운트.
export function createWriteRateLimit(opts: { max?: number; windowMs?: number } = {}) {
  return rateLimit({
    windowMs: opts.windowMs ?? WINDOW_MS,
    max: opts.max ?? IP_LIMIT,
    keyGenerator: (req: Request): string => ipKeyGenerator(req.ip ?? "unknown"),
    skip: skipForRead,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response, _next: NextFunction, options): void => {
      const retryAfterSec = Math.ceil(options.windowMs / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({ code: "TOO_MANY_REQUESTS", retryAfterSec });
    },
  });
}

export const writeRateLimit = createWriteRateLimit();

// Role 별 세밀 threshold (auth 이후 미들웨어) — 향후 Phase 2 확장 대상.
// 현재는 문서화만: apiRouter 전역 IP 리미터로 IP 당 60/min 상한 확보.
export const ROLE_WRITE_LIMITS: Readonly<Record<string, number>> = Object.freeze({
  SUPER_ADMIN: 60,
  ADMIN: 60,
  GM: 30,
  FRONT_OFFICE: 20,
  COACHING_STAFF: 20,
  PLAYER: 5,
  GUARDIAN: 5,
});
