import type { Request, Response, NextFunction } from "express";
import { assertCuid } from "../lib/cuidGuard";
import { requireUser } from "../lib/authMiddleware";
import type { SoftwareLicenseService } from "./software-license.service";

export class SoftwareLicenseController {
  constructor(private service: SoftwareLicenseService) {}

  list = async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await this.service.findAll()); } catch (e) { next(e); }
  };
  get = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await this.service.findById(assertCuid(req.params.id))); } catch (e) { next(e); }
  };
  create = async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await this.service.create(req.body, requireUser(req).id)); } catch (e) { next(e); }
  };
  update = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await this.service.update(assertCuid(req.params.id), req.body)); } catch (e) { next(e); }
  };
  assign = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await this.service.assign(assertCuid(req.params.id), req.body.userId)); } catch (e) { next(e); }
  };
  revoke = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await this.service.revoke(assertCuid(req.params.id), Number(req.params.userId))); } catch (e) { next(e); }
  };
}
