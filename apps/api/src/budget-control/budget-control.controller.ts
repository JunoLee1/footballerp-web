import type { Request, Response, NextFunction } from "express";
import { assertCuid } from "../lib/cuidGuard";
import type { BudgetControlService } from "./budget-control.service";

export class BudgetControlController {
  constructor(private service: BudgetControlService) {}

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await this.service.create(req.body, req.user!.id));
    } catch (e) { next(e); }
  };

  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const seasonId = req.query.seasonId ? Number(req.query.seasonId) : undefined;
      res.json(await this.service.getAll(seasonId));
    } catch (e) { next(e); }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.getById(assertCuid(req.params.id)));
    } catch (e) { next(e); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.update(assertCuid(req.params.id), req.body));
    } catch (e) { next(e); }
  };

  submit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.submit(assertCuid(req.params.id), req.user!.id));
    } catch (e) { next(e); }
  };

  approve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.approve(assertCuid(req.params.id), req.user!.id));
    } catch (e) { next(e); }
  };

  getAvailableBudget = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.getAvailableBudget(assertCuid(req.params.id)));
    } catch (e) { next(e); }
  };

  addLine = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await this.service.addLine(assertCuid(req.params.id), req.body));
    } catch (e) { next(e); }
  };

  updateLine = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.updateLine(assertCuid(req.params.id), assertCuid(req.params.lineId), req.body));
    } catch (e) { next(e); }
  };

  deleteLine = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.service.deleteLine(assertCuid(req.params.id), assertCuid(req.params.lineId));
      res.status(204).send();
    } catch (e) { next(e); }
  };

  requestAdjustment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await this.service.requestAdjustment(assertCuid(req.params.id), req.body, req.user!.id));
    } catch (e) { next(e); }
  };

  approveAdjustment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.approveAdjustment(assertCuid(req.params.id), assertCuid(req.params.adjId), req.user!.id));
    } catch (e) { next(e); }
  };

  rejectAdjustment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.rejectAdjustment(assertCuid(req.params.id), assertCuid(req.params.adjId), req.user!.id));
    } catch (e) { next(e); }
  };
}
