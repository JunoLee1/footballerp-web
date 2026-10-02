import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { requireUser } from "../lib/authMiddleware";
import { assertCuid } from "../lib/cuidGuard";
import { MatchLineupService } from "./match.lineup.service";
import type { SaveLineupDto } from "./dto/lineup.dto";

const EDIT_ROLES = ["ADMIN", "COACHING_STAFF", "HEAD_COACH"] as const;
const CONFIRM_ROLES = ["ADMIN", "HEAD_COACH"] as const;

export class MatchLineupController {
  constructor(private service: MatchLineupService) {}

  getLineup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const matchId = assertCuid(req.params["id"]);
      const lineup = await this.service.getLineup(matchId);
      res.json(lineup ?? null);
    } catch (err) { next(err); }
  };

  saveLineup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(EDIT_ROLES as readonly string[]).includes(user.role)) throw new AppError(403, "FORBIDDEN");
      const matchId = assertCuid(req.params["id"]);
      const dto = req.body as SaveLineupDto;
      const result = await this.service.saveLineup(matchId, dto);
      res.json(result);
    } catch (err) { next(err); }
  };

  confirmLineup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(CONFIRM_ROLES as readonly string[]).includes(user.role)) throw new AppError(403, "FORBIDDEN");
      const matchId = assertCuid(req.params["id"]);
      const result = await this.service.confirmLineup(matchId, user.id);
      res.json(result);
    } catch (err) { next(err); }
  };
}
