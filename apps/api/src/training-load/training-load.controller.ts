import { Request, Response, NextFunction } from "express";
import { requireUser } from "../lib/authMiddleware";
import { TrainingLoadService } from "./training-load.service";

export class TrainingLoadController {
  constructor(private service: TrainingLoadService) {}

  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId, playerId } = req.query;
      const query: Parameters<TrainingLoadService["getAll"]>[0] = {};
      if (sessionId) query.sessionId = sessionId as string;
      if (playerId) query.playerId = playerId as string;
      res.json(await this.service.getAll(query));
    } catch (err) { next(err); }
  };

  upsert = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, role, coachingRole } = requireUser(req);
      res.status(200).json(
        await this.service.upsert(req.body, String(id), role, coachingRole ?? null),
      );
    } catch (err) { next(err); }
  };

  getWeeklySummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { playerId, weekStart } = req.query;
      res.json(
        await this.service.getWeeklySummary({
          playerId: playerId as string,
          weekStart: weekStart as string,
        }),
      );
    } catch (err) { next(err); }
  };

  getInjuryCorrelation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = req.params["playerId"] as string;
      const weeks = req.query["weeks"] ? Number(req.query["weeks"]) : undefined;
      res.json(await this.service.getInjuryLoadCorrelation(playerId, weeks));
    } catch (err) { next(err); }
  };

  getGrowthTrajectory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = req.params["playerId"] as string;
      res.json(await this.service.getPlayerGrowthTrajectory(playerId));
    } catch (err) { next(err); }
  };

  getAnomalies = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const seasonId = req.query["seasonId"] ? Number(req.query["seasonId"]) : undefined;
      res.json(await this.service.detectLoadRpeAnomalies(seasonId));
    } catch (err) { next(err); }
  };

  getAcuteChronicRatio = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playerId = req.params["playerId"] as string;
      res.json(await this.service.getAcuteChronicRatio(playerId));
    } catch (err) { next(err); }
  };
}
