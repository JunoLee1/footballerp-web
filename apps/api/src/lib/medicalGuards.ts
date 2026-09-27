import type { Request, Response, NextFunction } from "express";
import { AppError } from "./appError";
import { isAdminLike } from "./permissions";

// 의료 개인정보 접근 허용 role.
// - admin / super_admin / GM (isAdminLike)
// - COACHING_STAFF · coachingRole MEDICAL / MEDICAL_DIRECTOR
// - FRONT_OFFICE · frontOfficeRole FINANCE_MANAGER / FINANCE_STAFF (승인·정산 목적)
// - PERFORMANCE 부서 카테고리 소속
function canReadMedical(
  role: string,
  coachingRole?: string | null,
  frontOfficeRole?: string | null,
  deptCategories?: string[] | null,
): boolean {
  if (isAdminLike(role)) return true;
  if (role === "COACHING_STAFF" && (coachingRole === "MEDICAL" || coachingRole === "MEDICAL_DIRECTOR")) return true;
  if (role === "FRONT_OFFICE" && (frontOfficeRole === "FINANCE_MANAGER" || frontOfficeRole === "FINANCE_STAFF")) return true;
  return deptCategories?.includes("PERFORMANCE") ?? false;
}

// GET /medical-expenses · /medical-equipment-loan 등 의료 관련 list read guard.
export function requireReadMedical(req: Request, _res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) return next(new AppError(401, "UNAUTHORIZED"));
  if (!canReadMedical(user.role, user.coachingRole, user.frontOfficeRole, user.departmentCategories)) {
    return next(new AppError(403, "FORBIDDEN"));
  }
  next();
}
