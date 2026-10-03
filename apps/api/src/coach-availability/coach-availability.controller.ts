import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { isAdminLike } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { CoachAvailabilityService } from "./coach-availability.service";
import { assertCuid } from "../lib/cuidGuard";

export class CoachAvailabilityController {
  constructor(private service: CoachAvailabilityService) {}

  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, from, to } = req.query;
      const query: Parameters<CoachAvailabilityService["getAll"]>[0] = {};
      if (userId) query.userId = String(userId);
      if (from) query.from = from as string;
      if (to) query.to = to as string;
      res.json(await this.service.getAll(query));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, coachingRole, departmentCategories, id: requesterId } = requireUser(req);
      const canCreate =
        isAdminLike(role) ||
        (role === "COACHING_STAFF" && coachingRole === "HEAD_COACH") ||
        (role === "COACHING_STAFF" && req.body.userId === requesterId) ||
        (departmentCategories?.includes('PERFORMANCE') ?? false);
      if (!canCreate) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(await this.service.create(req.body, requesterId));
    } catch (err) { next(err); }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: requesterId, role } = requireUser(req);
      await this.service.delete(assertCuid(req.params["id"]), requesterId, isAdminLike(role));
      res.status(204).send();
    } catch (err) { next(err); }
  };

  getConflicts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { date } = req.query;
      if (!date) throw new AppError(400, "DATE_REQUIRED");
      res.json(await this.service.getConflicts(date as string));
    } catch (err) { next(err); }
  };
}
