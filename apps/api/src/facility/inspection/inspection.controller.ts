import { Request, Response, NextFunction } from "express";
import { AppError } from "../../lib/appError";
import { canWriteFacility } from "../../lib/permissions";
import { requireUser } from "../../lib/authMiddleware";
import { assertCuid } from "../../lib/cuidGuard";
import type { InspectionService } from "./inspection.service";
import type { CreateInspectionDto, UpdateInspectionDto, InspectionListQuery } from "./dto/inspection.dto";

export class InspectionController {
  constructor(private service: InspectionService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.list(req.query as InspectionListQuery));
    } catch (err) {
      next(err);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.get(assertCuid(req.params.id)));
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: userId } = requireUser(req);
      if (!canWriteFacility(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const dto = req.body as CreateInspectionDto;
      const result = await this.service.create(dto, userId);
      if (dto.statutoryDeadline) {
        const deadline = new Date(dto.statutoryDeadline);
        const daysUntil = (deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        if (daysUntil <= 30) {
          console.warn(`[SafetyCert] Statutory deadline in ${Math.round(daysUntil)} days for inspection ${result.id}`);
        }
      }
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWriteFacility(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.update(assertCuid(req.params.id), req.body as UpdateInspectionDto));
    } catch (err) {
      next(err);
    }
  };
}
