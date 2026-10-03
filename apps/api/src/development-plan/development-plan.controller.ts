import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { requireUser } from "../lib/authMiddleware";
import { canWritePerformance } from "../lib/permissions";
import { DevelopmentPlanService } from "./development-plan.service";
import { assertCuid } from "../lib/cuidGuard";

export class DevelopmentPlanController {
  constructor(private service: DevelopmentPlanService) {}

  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { playerId, seasonId } = req.query;
      const query: import("./dto/development-plan.dto").PlanListQuery = {};
      if (playerId) query.playerId = playerId as string;
      if (seasonId) query.seasonId = Number(seasonId);
      res.json(await this.service.getAll(query));
    } catch (err) { next(err); }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.getById(assertCuid(req.params["id"])));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWritePerformance(user.role, user.coachingRole, user.departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(await this.service.create(req.body, user.id));
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, coachingRole, id: userId } = requireUser(req);
      res.json(await this.service.update(assertCuid(req.params["id"]), req.body, userId, role, coachingRole));
    } catch (err) { next(err); }
  };

  activate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, coachingRole, id: userId } = requireUser(req);
      res.json(await this.service.activate(assertCuid(req.params["id"]), userId, role, coachingRole));
    } catch (err) { next(err); }
  };

  review = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, coachingRole, id: userId } = requireUser(req);
      res.json(await this.service.review(assertCuid(req.params["id"]), userId, role, coachingRole));
    } catch (err) { next(err); }
  };
}
