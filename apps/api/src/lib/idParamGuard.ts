import { Request, Response, NextFunction, Router } from "express";
import { AppError } from "./appError";

export function assertIntId(value: string | string[] | undefined): number {
  if (typeof value !== "string") throw new AppError(400, "INVALID_ID");
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(400, "INVALID_ID");
  return n;
}

function intIdParam(_name: string) {
  return (_req: Request, _res: Response, next: NextFunction, value: string) => {
    try {
      assertIntId(value);
      next();
    } catch (err) {
      next(err);
    }
  };
}

// int autoincrement 로 보장된 param 이름 — 등록 안전.
// (playerId · userId · guardianId 는 UUID/string 이므로 제외)
const INT_ID_PARAM_NAMES = [
  "id",
  "seasonId",
  "deptId",
  "departmentId",
  "matchId",
  "loanId",
  "planId",
  "unitId",
  "runId",
  "resultId",
  "postingId",
  "partnerId",
  "logId",
  "clauseId",
  "tutorId",
  "teamId",
  "ruleId",
  "reportId",
  "paymentId",
  "hiringDispatchId",
  "eventId",
  "contractId",
  "assignmentId",
  "reviewerDeptId",
  "onboardingId",
  "subId",
  "sourceId",
  "aid",
] as const;

// Express 5 에서 router.param() 는 sub-router 로 전파되지 않아,
// int :id/:seasonId 등을 쓰는 각 sub-router 는 이 팩토리로 라우터를 만들어야 함.
// 컨트롤러 도달 전 400 INVALID_ID 로 400 처리 (#571).
// UUID :id 를 쓰는 sub-router (player/jersey) 는 이 팩토리를 쓰지 않고
// 기본 Router() 유지.
export function intIdRouter(): Router {
  const r = Router();
  for (const name of INT_ID_PARAM_NAMES) r.param(name, intIdParam(name));
  return r;
}
