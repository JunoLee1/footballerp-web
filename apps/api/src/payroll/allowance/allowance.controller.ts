import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../lib/appError";
import { canReadPayroll, canWritePayroll } from "../../lib/permissions";
import { requireUser } from "../../lib/authMiddleware";
import { assertCuid } from "../../lib/cuidGuard";
import type { AllowanceService } from "./allowance.service";
import type { CreateAllowanceDto, UpdateAllowanceDto } from "./dto/allowance.dto";

export class AllowanceController {
  constructor(private service: AllowanceService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canReadPayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.list(assertCuid(req.params["id"])));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWritePayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(
        await this.service.create(assertCuid(req.params["id"]), req.body as CreateAllowanceDto),
      );
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWritePayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(
        await this.service.update(
          assertCuid(req.params["id"]),
          Number(req.params["aid"]),
          req.body as UpdateAllowanceDto,
        ),
      );
    } catch (err) { next(err); }
  };

  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWritePayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      await this.service.remove(assertCuid(req.params["id"]), Number(req.params["aid"]));
      res.status(204).send();
    } catch (err) { next(err); }
  };
}
