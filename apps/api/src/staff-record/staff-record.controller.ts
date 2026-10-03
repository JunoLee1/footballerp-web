import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { canWriteHR, canReadHR } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { StaffRecordService } from "./staff-record.service";

function maskPhone(phone: string | null | undefined): string | null | undefined {
  if (!phone) return phone;
  return phone.slice(0, -4) + "****";
}

function withMaskedPhone<T extends { phone?: string | null }>(record: T, role: string, frontOfficeRole: string | null | undefined, departmentCategories?: string[]): T {
  if (canWriteHR(role, frontOfficeRole ?? null, departmentCategories)) return record;
  return { ...record, phone: maskPhone(record.phone) };
}

export class StaffRecordController {
  constructor(private service: StaffRecordService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canReadHR(role, frontOfficeRole ?? null, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const includeInactive = req.query["includeInactive"] === "true";
      const records = await this.service.list(includeInactive);
      res.json(records.map((r) => withMaskedPhone(r, role, frontOfficeRole, departmentCategories)));
    } catch (err) {
      next(err);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canReadHR(role, frontOfficeRole ?? null, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(withMaskedPhone(await this.service.get(String(req.params["id"])), role, frontOfficeRole, departmentCategories));
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id } = requireUser(req);
      if (!canWriteHR(role, frontOfficeRole ?? null, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(await this.service.create(req.body, id));
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: actorId } = requireUser(req);
      if (!canWriteHR(role, frontOfficeRole ?? null, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.update(String(req.params["id"]), req.body, actorId));
    } catch (err) {
      next(err);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: actorId } = requireUser(req);
      if (!canWriteHR(role, frontOfficeRole ?? null, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      await this.service.delete(String(req.params["id"]), actorId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  terminate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id } = requireUser(req);
      if (!canWriteHR(role, frontOfficeRole ?? null, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.terminate(String(req.params["id"]), id));
    } catch (err) {
      next(err);
    }
  };
}
