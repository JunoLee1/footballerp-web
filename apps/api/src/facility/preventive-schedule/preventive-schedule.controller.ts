import { Request, Response, NextFunction } from "express";
import { AppError } from "../../lib/appError";
import { requireUser } from "../../lib/authMiddleware";
import { canWriteFacility } from "../../lib/permissions";
import { assertCuid } from "../../lib/cuidGuard";
import type { PreventiveScheduleService } from "./preventive-schedule.service";
import type { CreatePreventiveScheduleDto, UpdatePreventiveScheduleDto, PreventiveScheduleListQuery } from "./dto/preventive-schedule.dto";

export class PreventiveScheduleController {
  constructor(private service: PreventiveScheduleService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.list(req.query as PreventiveScheduleListQuery));
    } catch (err) { next(err); }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.get(assertCuid(req.params.id)));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWriteFacility(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(await this.service.create(req.body as CreatePreventiveScheduleDto));
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWriteFacility(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.update(assertCuid(req.params.id), req.body as UpdatePreventiveScheduleDto));
    } catch (err) { next(err); }
  };

  deactivate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWriteFacility(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.deactivate(assertCuid(req.params.id)));
    } catch (err) { next(err); }
  };
}
