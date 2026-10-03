import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/appError";
import { requireUser } from "../lib/authMiddleware";
import { canWriteHR, isAdminLike } from "../lib/permissions";
import { assertCuid } from "../lib/cuidGuard";
import type {
  CancelEmployeeContractDto,
  CreateEmployeeContractDto,
  SignEmployeeContractDto,
} from "./dto/employee-contract.dto";
import type { EmployeeContractService } from "./employee-contract.service";

/**
 * REST layer for EmployeeContract (#371).
 *
 * Permissions:
 *   create / issue / sign  — canWriteHR (HR_MANAGER + admin-like)
 *   cancel                 — canWriteHR (HR_MANAGER + admin-like) — the plan
 *                            called for HR_MANAGER + GM + ADMIN, which
 *                            `canWriteHR` already covers via `isAdminLike`
 *                            (ADMIN / SUPER_ADMIN / GM).
 *   listByDispatch         — canWriteHR (HR-facing view)
 *
 * TODO(HR_STAFF widening): Plan Q5 gives HR_STAFF equal create/issue/sign
 * rights but the existing `canWriteHR` helper only covers HR_MANAGER +
 * admin-like. Widening is cross-cutting (asset-request / plan-report / etc.
 * all use the same helper) — deferred to a follow-up PR that touches the
 * shared permission layer. Matches the approach taken in #372.
 */
export class EmployeeContractController {
  constructor(private service: EmployeeContractService) {}

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWriteHR(user.role, user.frontOfficeRole, user.departmentCategories)) {
        throw new AppError(403, "FORBIDDEN");
      }

      const body = req.body as CreateEmployeeContractDto;
      const hiringDispatchId = assertCuid(body?.hiringDispatchId);

      const created = await this.service.createDraft(hiringDispatchId, user.id);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  };

  issue = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWriteHR(user.role, user.frontOfficeRole, user.departmentCategories)) {
        throw new AppError(403, "FORBIDDEN");
      }

      const id = assertCuid(req.params["id"]);

      const file = req.file;
      if (!file) throw new AppError(400, "FILE_REQUIRED");

      const updated = await this.service.issue(
        id,
        {
          path: file.path,
          filename: file.filename,
          originalname: file.originalname,
          size: file.size,
        },
        user.id,
      );
      res.json(updated);
    } catch (err) {
      next(err);
    }
  };

  sign = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWriteHR(user.role, user.frontOfficeRole, user.departmentCategories)) {
        throw new AppError(403, "FORBIDDEN");
      }

      const id = assertCuid(req.params["id"]);

      const file = req.file;
      if (!file) throw new AppError(400, "FILE_REQUIRED");

      // multer form fields land as strings — coerce nothing (signedAt stays a
      // string, service parses to Date + validates).
      const dto = req.body as SignEmployeeContractDto;

      const updated = await this.service.sign(
        id,
        {
          path: file.path,
          filename: file.filename,
          originalname: file.originalname,
          size: file.size,
        },
        dto,
        user.id,
      );
      res.json(updated);
    } catch (err) {
      next(err);
    }
  };

  cancel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      // Cancel gate — per plan Q5: HR_MANAGER + GM + ADMIN. `canWriteHR`
      // already scopes to HR_MANAGER + admin-like (GM/ADMIN/SUPER_ADMIN);
      // rejecting HR_STAFF here matches the plan's more restrictive cancel
      // permission (vs. create/issue/sign which are equal for HR_STAFF —
      // see class-level TODO on widening).
      if (!canWriteHR(user.role, user.frontOfficeRole, user.departmentCategories)) {
        throw new AppError(403, "FORBIDDEN");
      }

      const id = assertCuid(req.params["id"]);

      const dto = req.body as CancelEmployeeContractDto;
      const updated = await this.service.cancel(id, dto, user.id);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  };

  listByDispatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      // Read scope — same as write for HR-facing view. GM can read via
      // isAdminLike. Widening to non-HR roles (e.g. team lead) is deferred.
      if (
        !canWriteHR(user.role, user.frontOfficeRole, user.departmentCategories) &&
        !isAdminLike(user.role)
      ) {
        throw new AppError(403, "FORBIDDEN");
      }

      const hiringDispatchId = assertCuid(req.params["hiringDispatchId"]);

      const rows = await this.service.listByDispatch(hiringDispatchId);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  };
}
