import type { Request, Response, NextFunction } from "express";
import { requireUser } from "../lib/authMiddleware";
import type { LedgerService } from "./ledger.service";
import { assertCuid } from "../lib/cuidGuard";

export class LedgerController {
  constructor(private service: LedgerService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await this.service.findAll(req.query as any)); } catch (e) { next(e); }
  };
  get = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await this.service.findById(assertCuid(req.params.id))); } catch (e) { next(e); }
  };
  create = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await this.service.create(req.body, requireUser(req).id)); } catch (e) { next(e); }
  };
  refund = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await this.service.createRefund(assertCuid(req.params.id), requireUser(req).id)); } catch (e) { next(e); }
  };

  lockPeriod = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { year, month } = req.query as { year?: string; month?: string };
      if (!year || !month) { res.status(400).json({ code: "YEAR_MONTH_REQUIRED" }); return; }
      const y = Number(year), m = Number(month);
      if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12 || y < 2000 || y > 2100) {
        res.status(400).json({ code: "INVALID_YEAR_MONTH" }); return;
      }
      res.status(201).json(await this.service.lockPeriod(y, m, req.user!.id));
    } catch (err) {
      next(err);
    }
  };
}
