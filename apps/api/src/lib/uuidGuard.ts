import { Request, Response, NextFunction } from "express";
import { AppError } from "./appError";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && UUID_RE.test(v);

// #troubles-md-5: enumeration 공격 조기 차단 — 유저-ID URL param 이 UUID 형식이 아니면 400.
// Prisma 가 조회 실패로 조용히 404 를 뱉기 전에 명시적으로 거절하고 IDS/로깅이 잡기 쉽게.
export const requireUuidParam = (key: string) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const v = req.params[key];
    if (!isUuid(v)) return next(new AppError(400, "INVALID_UUID"));
    next();
  };
