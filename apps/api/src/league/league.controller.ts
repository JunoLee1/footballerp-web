import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { requireSuperAdmin } from "../lib/permissions";
import { LeagueService } from "./league.service";
import { CreateLeagueDto, UpdateLeagueDto } from "./league.dto";

export class LeagueController {
  constructor(private service: LeagueService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.list());
    } catch (err) { next(err); }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.get(Number(req.params["id"])));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      res.status(201).json(await this.service.create(req.body as CreateLeagueDto));
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      res.json(await this.service.update(Number(req.params["id"]), req.body as UpdateLeagueDto));
    } catch (err) { next(err); }
  };

  registerClub = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const leagueId = Number(req.params["id"]);
      const { clubId } = req.body as { clubId: string };
      if (!clubId || typeof clubId !== "string") throw new AppError(400, "CLUB_ID_REQUIRED");
      res.json(await this.service.registerClub(leagueId, clubId));
    } catch (err) { next(err); }
  };

  removeClub = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const leagueId = Number(req.params["id"]);
      const clubIdParam = req.params["clubId"];
      if (typeof clubIdParam !== "string") throw new AppError(400, "CLUB_ID_REQUIRED");
      res.json(await this.service.removeClub(leagueId, clubIdParam));
    } catch (err) { next(err); }
  };
}
