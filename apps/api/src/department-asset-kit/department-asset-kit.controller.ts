import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/appError";
import { requireUser } from "../lib/authMiddleware";
import { isAdminLike } from "../lib/permissions";
import type { UpsertDepartmentAssetKitDto } from "./dto/department-asset-kit.dto";
import type { DepartmentAssetKitService } from "./department-asset-kit.service";
import { assertCuid } from "../lib/cuidGuard";

/**
 * REST layer for DepartmentDefaultAssetKit (#373).
 *
 * Permissions (grill decision — kit management is ADMIN + ASSET_MANAGER, HR
 * doesn't own asset lifecycle):
 *   GET    — ADMIN / ASSET_MANAGER / ASSET_STAFF (read-only can include ASSET_STAFF)
 *   PUT    — ADMIN / ASSET_MANAGER
 *   DELETE — ADMIN / ASSET_MANAGER
 *
 * The auto-provisioning hook (`provisionNewEmployeeAssets`) is a passive
 * reader — no scope check there since it runs server-side inside the dispatch
 * flow. Only the human-facing endpoints below need explicit role gates.
 */
export class DepartmentAssetKitController {
  constructor(private service: DepartmentAssetKitService) {}

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      this.assertCanRead(user);

      const departmentId = assertCuid(req.params["departmentId"]);
      const kit = await this.service.getByDepartment(departmentId);
      res.json(kit ?? null);
    } catch (err) {
      next(err);
    }
  };

  upsert = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      this.assertCanWrite(user);
      const departmentId = assertCuid(req.params["departmentId"]); 
      const body = req.body as UpsertDepartmentAssetKitDto;
      const kit = await this.service.upsert(departmentId, body, user.id);
      res.json(kit);
    } catch (err) {
      next(err);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      this.assertCanWrite(user);

      const departmentId = assertCuid(req.params["departmentId"]);
    
      const removed = await this.service.remove(departmentId, user.id);
      res.json(removed);
    } catch (err) {
      next(err);
    }
  };

  // ────────────────────────────────────────────
  // Role gates (local — kit lives under /departments/:id/asset-kit and doesn't
  // share the HR permission helper family)
  // ────────────────────────────────────────────

  private assertCanRead(user: {
    role: string;
    frontOfficeRole?: string | null | undefined;
  }): void {
    if (isAdminLike(user.role)) return;
    if (
      user.role === "FRONT_OFFICE" &&
      (user.frontOfficeRole === "ASSET_MANAGER" ||
        user.frontOfficeRole === "ASSET_STAFF")
    ) {
      return;
    }
    throw new AppError(403, "FORBIDDEN");
  }

  private assertCanWrite(user: {
    role: string;
    frontOfficeRole?: string | null | undefined;
  }): void {
    if (isAdminLike(user.role)) return;
    if (
      user.role === "FRONT_OFFICE" &&
      user.frontOfficeRole === "ASSET_MANAGER"
    ) {
      return;
    }
    throw new AppError(403, "FORBIDDEN");
  }
}
