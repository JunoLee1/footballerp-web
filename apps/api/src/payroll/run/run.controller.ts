import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../lib/appError";
import { isAdminLike, canWriteFinance, canWriteHR } from "../../lib/permissions";
import { requireUser } from "../../lib/authMiddleware";
import { assertCuid } from "../../lib/cuidGuard";
import type { RunService } from "./run.service";
import type { CreateRunDto } from "./dto/run.dto";

export class RunController {
  constructor(private service: RunService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canWriteFinance(role, frontOfficeRole) && !canWriteHR(role, frontOfficeRole))
        throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.list(assertCuid(req.params["id"])));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canWriteHR(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(
        await this.service.createRun(assertCuid(req.params["id"]), req.body as CreateRunDto),
      );
    } catch (err) { next(err); }
  };

  confirm = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, id: userId } = requireUser(req);
      if (!canWriteFinance(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.json(
        await this.service.confirmRun(
          assertCuid(req.params["id"]),
          assertCuid(req.params["runId"]),
          userId,
        ),
      );
    } catch (err) { next(err); }
  };

  secondApprove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, id: userId } = requireUser(req);
      if (!isAdminLike(role)) throw new AppError(403, "FORBIDDEN");
      res.json(
        await this.service.secondApproveRun(
          assertCuid(req.params["id"]),
          assertCuid(req.params["runId"]),
          userId,
        ),
      );
    } catch (err) { next(err); }
  };
}
