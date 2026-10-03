import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { requireUser } from "../lib/authMiddleware";
import { PlayerCallupService } from "./player-callup.service";
import { assertCuid } from "../lib/cuidGuard";

export class PlayerCallupController {
  constructor(private service: PlayerCallupService) {}

  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = req.query["status"] ? { status: req.query["status"] as string } : {};
      res.json(await this.service.getAll(q));
    } catch (err) { next(err); }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.getById(assertCuid(req.params["id"])));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, coachingRole, id: userId } = requireUser(req);
      if (role !== "COACHING_STAFF" || coachingRole !== "HEAD_COACH") {
        throw new AppError(403, "FORBIDDEN");
      }
      res.status(201).json(await this.service.create(req.body, userId));
    } catch (err) { next(err); }
  };

  approve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, coachingRole, id: userId } = requireUser(req);
      const isGM = role === "GM";
      const isTD = role === "FRONT_OFFICE" && frontOfficeRole === "TD";
      const isHeadCoach = role === "COACHING_STAFF" && coachingRole === "HEAD_COACH";
      if (!isGM && !isTD && !isHeadCoach) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.approve(assertCuid(req.params["id"]), userId, isGM));
    } catch (err) { next(err); }
  };

  reject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, id: userId } = requireUser(req);
      if (role !== "GM") {
        throw new AppError(403, "FORBIDDEN");
      }
      res.json(await this.service.reject(assertCuid(req.params["id"]), userId, req.body));
    } catch (err) { next(err); }
  };

  complete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, coachingRole, id: userId } = requireUser(req);
      const isHeadCoach = role === "COACHING_STAFF" && coachingRole === "HEAD_COACH";
      const isGM = role === "GM";
      if (!isHeadCoach && !isGM) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.complete(assertCuid(req.params["id"]), userId));
    } catch (err) { next(err); }
  };

  confirmYouth = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, coachingRole, teamId } = requireUser(req);
      if (role !== "COACHING_STAFF" || coachingRole !== "HEAD_COACH") {
        throw new AppError(403, "FORBIDDEN");
      }
      res.json(await this.service.confirmYouth(assertCuid(req.params["id"]), teamId ?? null));
    } catch (err) { next(err); }
  };

  confirmMedical = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, coachingRole, departmentCategories } = requireUser(req);
      const canConfirm =
        (role === "COACHING_STAFF" && coachingRole === "MEDICAL") ||
        (departmentCategories?.includes('PERFORMANCE') ?? false);
      if (!canConfirm) {
        throw new AppError(403, "FORBIDDEN");
      }
      res.json(await this.service.confirmMedical(assertCuid(req.params["id"])));
    } catch (err) { next(err); }
  };
}
