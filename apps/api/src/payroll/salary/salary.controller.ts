import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../lib/appError";
import { canReadPayroll, canWritePayroll } from "../../lib/permissions";
import { requireUser } from "../../lib/authMiddleware";
import type { SalaryService } from "./salary.service";
import type { CreateSalaryDto, UpdateSalaryDto, SalaryListQuery } from "./dto/salary.dto";

export class SalaryController {
  constructor(private service: SalaryService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canReadPayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.list(req.query as SalaryListQuery));
    } catch (err) { next(err); }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canReadPayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.get(Number(req.params["id"])));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: actorId, role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWritePayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(await this.service.create(req.body as CreateSalaryDto, actorId));
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: actorId, role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWritePayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.update(Number(req.params["id"]), req.body as UpdateSalaryDto, actorId));
    } catch (err) { next(err); }
  };
}
