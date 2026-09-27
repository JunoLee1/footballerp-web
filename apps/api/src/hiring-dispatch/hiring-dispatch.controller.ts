import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { requireUser } from "../lib/authMiddleware";
import { isAdminLike } from "../lib/permissions";
import { HiringDispatchService } from "./hiring-dispatch.service";
import {
  BudgetReverifyDto,
  CancelDto,
  CreateHiringDispatchDto,
  ListHiringDispatchQuery,
  RejectDto,
} from "./dto/hiring-dispatch.dto";

/**
 * Serializes BigInt fields (monthlySalary) so JSON.stringify doesn't blow up.
 * Recursive so nested relations (approvals[].reviewer, etc.) survive too.
 */
function serialize(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "bigint") return obj.toString();
  if (Array.isArray(obj)) return obj.map(serialize);
  if (obj instanceof Date) return obj;
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = serialize(v);
    }
    return out;
  }
  return obj;
}

export class HiringDispatchController {
  constructor(private service: HiringDispatchService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, role } = requireUser(req);
      const { filter, status } = req.query as ListHiringDispatchQuery;
      // GM-approval queue (pending-*) 는 GM/ADMIN 계층만 조회.
      if (filter && filter.startsWith("pending-") && !isAdminLike(role)) {
        throw new AppError(403, "FORBIDDEN");
      }
      const rows = await this.service.list(userId, role, filter, status);
      res.json(serialize(rows));
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireUser(req);
      const id = Number(req.params["id"]);
      if (!Number.isFinite(id)) throw new AppError(400, "INVALID_ID");
      const row = await this.service.getById(id);
      res.json(serialize(row));
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, role, frontOfficeRole } = requireUser(req);
      const dto = req.body as CreateHiringDispatchDto;
      const row = await this.service.create(dto, userId, role, frontOfficeRole);
      res.status(201).json(serialize(row));
    } catch (err) {
      next(err);
    }
  };

  budgetReverify = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, role, frontOfficeRole } = requireUser(req);
      const id = Number(req.params["id"]);
      const body = (req.body ?? {}) as BudgetReverifyDto;
      const row = await this.service.budgetReverify(id, userId, role, frontOfficeRole, body);
      res.json(serialize(row));
    } catch (err) {
      next(err);
    }
  };

  budgetReject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, role, frontOfficeRole } = requireUser(req);
      const id = Number(req.params["id"]);
      const { reason } = (req.body ?? {}) as RejectDto;
      const row = await this.service.budgetReject(id, userId, role, frontOfficeRole, reason);
      res.json(serialize(row));
    } catch (err) {
      next(err);
    }
  };

  dispatchApprove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, role } = requireUser(req);
      const id = Number(req.params["id"]);
      const row = await this.service.dispatchApprove(id, userId, role);
      res.json(serialize(row));
    } catch (err) {
      next(err);
    }
  };

  dispatchReject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, role } = requireUser(req);
      const id = Number(req.params["id"]);
      const { reason } = (req.body ?? {}) as RejectDto;
      const row = await this.service.dispatchReject(id, userId, role, reason);
      res.json(serialize(row));
    } catch (err) {
      next(err);
    }
  };

  dispatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, role, frontOfficeRole } = requireUser(req);
      const id = Number(req.params["id"]);
      const row = await this.service.dispatch(id, userId, role, frontOfficeRole);
      res.json(serialize(row));
    } catch (err) {
      next(err);
    }
  };

  cancel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, role, frontOfficeRole } = requireUser(req);
      const id = Number(req.params["id"]);
      const { reason } = (req.body ?? {}) as CancelDto;
      const row = await this.service.cancel(id, userId, role, frontOfficeRole, reason);
      res.json(serialize(row));
    } catch (err) {
      next(err);
    }
  };

  complete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, role, frontOfficeRole } = requireUser(req);
      const id = Number(req.params["id"]);
      const row = await this.service.complete(id, userId, role, frontOfficeRole);
      res.json(serialize(row));
    } catch (err) {
      next(err);
    }
  };
}
