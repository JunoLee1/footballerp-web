import { Request, Response, NextFunction, Router } from "express";
import { AppError } from "./appError";

// Prisma cuid() 는 "c" + 24 chars [a-z0-9] 를 생성. 관대하게: 소문자/숫자 15-30자.
const CUID_RE = /^c[a-z0-9]{15,30}$/;

export function assertCuid(value: string | string[] | undefined): string {
  if (typeof value !== "string") throw new AppError(400, "INVALID_ID");
  // 정수로 변환 가능한 값 명시 차단 — enumerable IDOR 방어 (#598).
  // cuid 는 'c' 로 시작하므로 실질 중복이지만, 리뷰 요청 반영 후 명시적 의도로 유지.
  // 빈 문자열(Number("") === 0) 도 차단.
  if (value === "" || !Number.isNaN(Number(value))) {
    throw new AppError(400, "INVALID_ID");
  }
  if (!CUID_RE.test(value)) throw new AppError(400, "INVALID_ID");
  return value;
}

function cuidParam() {
  return (_req: Request, _res: Response, next: NextFunction, value: string) => {
    try {
      assertCuid(value);
      next();
    } catch (err) {
      next(err);
    }
  };
}

// 하나 이상의 param 이름을 cuid 로 강제하는 Router 팩토리.
// 기본 :id 를 cuid 로 강제.
export function cuidRouter(...paramNames: string[]): Router {
  const r = Router();
  const names = paramNames.length ? paramNames : ["id"];
  for (const name of names) r.param(name, cuidParam());
  return r;
}
