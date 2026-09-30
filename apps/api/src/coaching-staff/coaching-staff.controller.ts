import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { isAdminLike } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { CoachingStaffService } from "./coaching-staff.service";
import { CoachingStaffEvalRepository } from "./coaching-staff-eval.repo";

function getWeekBounds(refDate: Date): { start: Date; end: Date } {
  const day = refDate.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(refDate);
  start.setDate(refDate.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export class CoachingStaffController {
  constructor(private service: CoachingStaffService, private evalRepo?: CoachingStaffEvalRepository) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, coachingRole, departmentCategories } = requireUser(req);
      const canAccess =
        isAdminLike(role) ||
        role === "GM" ||
        (role === "COACHING_STAFF" && coachingRole === "HEAD_COACH") ||
        (departmentCategories?.includes('PERFORMANCE') ?? false);
      if (!canAccess) throw new AppError(403, "FORBIDDEN");

      const refDate = req.query["week"]
        ? new Date(req.query["week"] as string)
        : new Date();
      const { start, end } = getWeekBounds(refDate);

      res.json(await this.service.getAll(start, end));
    } catch (err) {
      next(err);
    }
  };

  listEvaluations = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, departmentCategories } = requireUser(req);
      if (!isAdminLike(role) && role !== "COACHING_STAFF" && !(departmentCategories?.includes('PERFORMANCE') ?? false))
        throw new AppError(403, "FORBIDDEN");
      const staffUserId = String(req.params["staffUserId"] ?? "");
      res.json(await this.evalRepo!.listForStaff(staffUserId));
    } catch (err) { next(err); }
  };

  createEvaluation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, coachingRole } = requireUser(req);  // HEAD_COACH 전용, deptCategories 불필요
      if (!isAdminLike(role) && !(role === "COACHING_STAFF" && coachingRole === "HEAD_COACH"))
        throw new AppError(403, "FORBIDDEN");
      const staffUserId = String(req.params["staffUserId"] ?? "");
      const { score, comment } = req.body as { score: number; comment?: string };
      const user = requireUser(req);
      const row = await this.evalRepo!.create(staffUserId, user.id, score, comment);
      res.status(201).json(row);
    } catch (err) { next(err); }
  };
}
