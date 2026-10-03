import { Request, Response, NextFunction } from "express";
import { FanRepository } from "./fan.repo";
import { requireUser } from "../../lib/authMiddleware";
import { AppError } from "../../lib/appError";
import { getPrisma } from "../../lib/prisma";
import { assertCuid } from "../../lib/cuidGuard";

export class FanController {
  private repo = new FanRepository(getPrisma());

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireUser(req);
      res.json(await this.repo.findAll());
    } catch (err) { next(err); }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireUser(req);
      const fan = await this.repo.findById(assertCuid(req.params["id"]));
      if (!fan) throw new AppError(404, "FAN_NOT_FOUND");
      res.json(fan);
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireUser(req);
      const { name, email, phone } = req.body as { name: string; email?: string; phone?: string };
      if (!name) throw new AppError(400, "NAME_REQUIRED");
      res.status(201).json(await this.repo.create({ name, ...(email !== undefined ? { email } : {}), ...(phone !== undefined ? { phone } : {}) }));
    } catch (err) { next(err); }
  };

  createMembership = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireUser(req);
      const fanId = assertCuid(req.params["id"]);
      const { tier, startDate, endDate } = req.body as { tier: string; startDate: string; endDate: string };
      if (!tier || !startDate || !endDate) throw new AppError(400, "MISSING_REQUIRED_FIELDS");
      if (new Date(startDate) >= new Date(endDate)) throw new AppError(400, "INVALID_DATE_RANGE");
      res.status(201).json(await this.repo.createMembership({ fanId, tier, startDate: new Date(startDate), endDate: new Date(endDate) }));
    } catch (err) { next(err); }
  };

  membershipStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireUser(req);
      res.json(await this.repo.getMembershipStats());
    } catch (err) { next(err); }
  };

  getSeatZones = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireUser(req);
      res.json(await this.repo.getSeatZonesByMatch(assertCuid(req.params["matchId"])));
    } catch (err) { next(err); }
  };

  createSeatZone = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireUser(req);
      const { matchId, name, capacity } = req.body as { matchId: string; name: string; capacity: number };
      res.status(201).json(await this.repo.createSeatZone({ matchId, name, capacity }));
    } catch (err) { next(err); }
  };
}
