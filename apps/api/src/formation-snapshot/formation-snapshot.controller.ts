import { Request, Response, NextFunction } from "express";
import { requireUser } from "../lib/authMiddleware";
import { isAdminLike } from "../lib/permissions";
import { AppError } from "../lib/appError";
import { FormationSnapshotService } from "./formation-snapshot.service";
import { assertCuid } from "../lib/cuidGuard";

export class FormationSnapshotController {
  constructor(private service: FormationSnapshotService) {}

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!isAdminLike(user.role) && user.role !== "COACHING_STAFF") throw new AppError(403, "FORBIDDEN");
      res.status(201).json(await this.service.create(req.body, user.id));
    } catch (err) { next(err); }
  };

  findByMatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json(await this.service.findByMatch(assertCuid(req.params["matchId"])));
    } catch (err) { next(err); }
  };

  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role } = requireUser(req);
      if (!isAdminLike(role) && role !== "COACHING_STAFF") throw new AppError(403, "FORBIDDEN");
      await this.service.remove(assertCuid(req.params["id"]));
      res.status(204).send();
    } catch (err) { next(err); }
  };
}
