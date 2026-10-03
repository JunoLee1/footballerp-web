import type { Request, Response, NextFunction } from "express";
import type { InventoryService } from "./inventory.service";

export class InventoryController {
  constructor(private service: InventoryService) {}

  list = async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await this.service.findAll()); } catch (e) { next(e); }
  };
  create = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await this.service.create(req.body)); } catch (e) { next(e); }
  };
  adjust = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await this.service.adjustQuantity(String(req.params.id), Number(req.body.delta))); } catch (e) { next(e); }
  };
  alerts = async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await this.service.getAlerts()); } catch (e) { next(e); }
  };
}
