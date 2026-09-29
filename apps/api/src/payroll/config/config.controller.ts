import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../lib/appError";
import { canReadPayroll, canWritePayroll } from "../../lib/permissions";
import { requireUser } from "../../lib/authMiddleware";
import type { ConfigService } from "./config.service";
import type { CreatePayrollConfigDto, UpdatePayrollConfigDto, PayrollConfigListQuery } from "./dto/config.dto";

export class ConfigController {
  constructor(private service: ConfigService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canReadPayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.list(req.query as PayrollConfigListQuery));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWritePayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(await this.service.create(req.body as CreatePayrollConfigDto));
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWritePayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.update(Number(req.params["id"]), req.body as UpdatePayrollConfigDto));
    } catch (err) { next(err); }
  };
}
