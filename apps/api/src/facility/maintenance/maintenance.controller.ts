import { Request, Response, NextFunction } from "express";
import { AppError } from "../../lib/appError";
import { isAdminLike, canWriteFacility } from "../../lib/permissions";
import { requireUser } from "../../lib/authMiddleware";
import type { MaintenanceService } from "./maintenance.service";
import type { CreateMaintenanceDto, UpdateMaintenanceDto, MaintenanceListQuery } from "./dto/maintenance.dto";
import { assertCuid } from "../../lib/cuidGuard";

const VALID_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "REJECTED"],
  IN_PROGRESS: ["PENDING_APPROVAL", "REJECTED"],
  PENDING_APPROVAL: ["RESOLVED", "REJECTED", "IN_PROGRESS"],
  RESOLVED: [],
  REJECTED: [],
};

export class MaintenanceController {
  constructor(private service: MaintenanceService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.list(req.query as MaintenanceListQuery));
    } catch (err) { next(err); }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.get(assertCuid(req.params.id)));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id } = requireUser(req);
      if (!canWriteFacility(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const result = await this.service.create(req.body as CreateMaintenanceDto, id);
      res.status(201).json(result);
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: updatedById } = requireUser(req);
      if (!canWriteFacility(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.update(assertCuid(req.params.id), req.body as UpdateMaintenanceDto, updatedById));
    } catch (err) { next(err); }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWriteFacility(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const id = assertCuid(req.params.id);
      const { status } = req.body as { status: string };
      const existing = await this.service.get(id);
      const allowed = VALID_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(status)) {
        throw new AppError(400, "INVALID_STATUS_TRANSITION");
      }
      res.json(await this.service.updateStatus(id, status));
    } catch (err) { next(err); }
  };

  approve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id } = requireUser(req);
      if (!canWriteFacility(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.approve(assertCuid(req.params.id), id));
    } catch (err) { next(err); }
  };

  gmApprove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, id } = requireUser(req);
      if (!isAdminLike(role)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.gmApprove(assertCuid(req.params.id), id));
    } catch (err) { next(err); }
  };

  reject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: actorId } = requireUser(req);
      if (!canWriteFacility(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.reject(assertCuid(req.params.id), req.body.reason, actorId));
    } catch (err) { next(err); }
  };
}
