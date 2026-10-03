import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { requireUser } from "../lib/authMiddleware";
import type { GrowthReportService } from "./growth-report.service";
import type { CreateGrowthEvaluationDto, AwardBadgeDto } from "./dto/growth-report.dto";
import { BadgeType } from "../generated/enums";

const COACH_ROLES = ["ADMIN", "COACHING_STAFF"] as const;

export class GrowthReportController {
  constructor(private service: GrowthReportService) {}

  getEvaluationsByPlayer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const playerId = String(req.params["playerId"]);
      if (user.role === "GUARDIAN") {
        return res.json(await this.service.getEvaluationsByPlayerForGuardian(playerId, user.id));
      }
      res.json(await this.service.getEvaluationsByPlayer(playerId));
    } catch (e) { next(e); }
  };

  getEvaluationById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.getEvaluationById(String(req.params["id"])));
    } catch (e) { next(e); }
  };

  createEvaluation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(COACH_ROLES as readonly string[]).includes(user.role)) throw new AppError(403, "FORBIDDEN");
      const body = req.body as CreateGrowthEvaluationDto;
      if (
        !body.playerId || !body.year || !body.month ||
        body.attitudeScore == null || !body.attitudeComment ||
        body.fundamentalsScore == null || !body.fundamentalsComment ||
        body.spatialScore == null || !body.spatialComment ||
        body.physicalScore == null || !body.physicalComment
      ) {
        throw new AppError(400, "MISSING_FIELDS");
      }
      res.status(201).json(await this.service.createEvaluation(body, user.id));
    } catch (e) { next(e); }
  };

  updateEvaluation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(COACH_ROLES as readonly string[]).includes(user.role)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.updateEvaluation(String(req.params["id"]), req.body, user.id));
    } catch (e) { next(e); }
  };

  publishEvaluation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(COACH_ROLES as readonly string[]).includes(user.role)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.publishEvaluation(String(req.params["id"])));
    } catch (e) { next(e); }
  };

  getPositionAverage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = req.query["playerId"] as string;
      if (!playerId) throw new AppError(400, "PLAYER_ID_REQUIRED");
      const result = await this.service.getPositionAverage(playerId);
      if (!result) throw new AppError(404, "PLAYER_NOT_FOUND");
      res.status(200).json(result);
    } catch (err) { next(err); }
  };

  getBadgesByPlayer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.getBadgesByPlayer(String(req.params["playerId"])));
    } catch (e) { next(e); }
  };

  awardBadge = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(COACH_ROLES as readonly string[]).includes(user.role)) throw new AppError(403, "FORBIDDEN");
      const body = req.body as AwardBadgeDto;
      if (!body.playerId || !body.badgeType) throw new AppError(400, "MISSING_FIELDS");
      if (!Object.values(BadgeType).includes(body.badgeType)) throw new AppError(400, "INVALID_BADGE_TYPE");
      res.status(201).json(await this.service.awardBadge(body, user.id));
    } catch (e) { next(e); }
  };
}
