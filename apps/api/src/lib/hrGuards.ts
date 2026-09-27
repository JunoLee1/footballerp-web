import type { Request, Response, NextFunction } from "express";
import { AppError } from "./appError";
import { canReadHR, canWriteHR } from "./permissions";

// HR 도메인 (`/hiring-surveys`, `/plan-reports`) read 접근 guard.
// canReadHR: isAdminLike · HR_MANAGER · HR_STAFF · HR 부서 카테고리 소속 유저 허용.
export function requireReadHR(req: Request, _res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) return next(new AppError(401, "UNAUTHORIZED"));
  const { role, frontOfficeRole, departmentCategories } = user;
  if (!canReadHR(role, frontOfficeRole ?? null, departmentCategories)) {
    return next(new AppError(403, "FORBIDDEN"));
  }
  next();
}

// HR 도메인 write (create/update/delete) guard.
// canWriteHR: isAdminLike · HR_MANAGER · HR 부서 카테고리 소속 (HR_STAFF 제외).
export function requireWriteHR(req: Request, _res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) return next(new AppError(401, "UNAUTHORIZED"));
  const { role, frontOfficeRole, departmentCategories } = user;
  if (!canWriteHR(role, frontOfficeRole ?? null, departmentCategories)) {
    return next(new AppError(403, "FORBIDDEN"));
  }
  next();
}
