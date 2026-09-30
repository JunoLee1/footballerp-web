import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { isAdminLike } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { TrainingService } from "./training.service";
import { SessionListQuery } from "./dto/training.dto";
import { assertCuid } from "../lib/cuidGuard";

const STAFF_ROLES = ["ADMIN", "SUPER_ADMIN", "COACHING_STAFF"] as const;

export class TrainingController {
  constructor(private service: TrainingService) {}

  getSessions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const query: SessionListQuery = {};
      if (req.query["seasonId"]) query.seasonId = Number(req.query["seasonId"]);
      res.status(200).json(await this.service.getSessions(query, user.clubId));
    } catch (err) { next(err); }
  };

  getSessionById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      res.status(200).json(await this.service.getSessionById(assertCuid(req.params["id"]), user.clubId));
    } catch (err) { next(err); }
  };

  createSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(STAFF_ROLES as readonly string[]).includes(user.role) && !(user.departmentCategories?.includes('PERFORMANCE') ?? false))
        throw new AppError(403, "FORBIDDEN");
      if (req.body.sessionType === "GOALKEEPER") {
        const isGK = isAdminLike(user.role) || user.coachingRole === "GOALKEEPER_COACH";
        if (!isGK) throw new AppError(403, "FORBIDDEN");
      }
      res.status(201).json(await this.service.createSession(req.body, user.id, user.clubId));
    } catch (err) { next(err); }
  };

  approveSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const canApprove =
        isAdminLike(user.role) || (user.role === "COACHING_STAFF" && user.coachingRole === "HEAD_COACH");
      if (!canApprove) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.approveSession(assertCuid(req.params["id"]), user.id, user.clubId));
    } catch (err) { next(err); }
  };

  addContent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(STAFF_ROLES as readonly string[]).includes(user.role) && !(user.departmentCategories?.includes('PERFORMANCE') ?? false))
        throw new AppError(403, "FORBIDDEN");
      res.status(201).json(await this.service.addContent(assertCuid(req.params["id"]), req.body, user.clubId));
    } catch (err) { next(err); }
  };

  addParticipants = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(STAFF_ROLES as readonly string[]).includes(user.role) && !(user.departmentCategories?.includes('PERFORMANCE') ?? false))
        throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.addParticipants(assertCuid(req.params["id"]), req.body, user.clubId));
    } catch (err) { next(err); }
  };

  upsertResult = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(STAFF_ROLES as readonly string[]).includes(user.role) && !(user.departmentCategories?.includes('PERFORMANCE') ?? false))
        throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.upsertResult(assertCuid(req.params["id"]), req.body, user.clubId));
    } catch (err) { next(err); }
  };

  getResults = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = req.query as Record<string, string | undefined>
      const filters: { from?: string; to?: string; sessionType?: string; playerId?: string; nullOnly?: boolean } = {}
      if (q["from"]) filters.from = q["from"]
      if (q["to"]) filters.to = q["to"]
      if (q["sessionType"]) filters.sessionType = q["sessionType"]
      if (q["playerId"]) filters.playerId = q["playerId"]
      if (q["nullOnly"] === "true") filters.nullOnly = true
      res.status(200).json(await this.service.getResults(filters))
    } catch (err) { next(err) }
  }

  getResultById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resultId = Number(req.params["resultId"]);
      res.status(200).json(await this.service.getResultById(resultId));
    } catch (err) { next(err); }
  }

  correctAttendance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!isAdminLike(user.role)) throw new AppError(403, "FORBIDDEN");
      const { attendance, reason } = req.body;
      res.status(200).json(
        await this.service.correctAttendance(Number(req.params["resultId"]), user.id, attendance, reason)
      );
    } catch (err) { next(err); }
  };
}
