import { Request, Response, NextFunction } from "express";
import { assertCuid } from "../../lib/cuidGuard";
import { AppError } from "../../lib/appError";
import { isAdminLike } from "../../lib/permissions";
import { requireUser } from "../../lib/authMiddleware";
import type { ContactLogService } from "./contact-log.service";
import type { CreateContactLogDto } from "./dto/contact-log.dto";

const isAssetManager = (role: string, frontOfficeRole: string | null | undefined) =>
  isAdminLike(role) || (role === "FRONT_OFFICE" && frontOfficeRole === "ASSET_MANAGER");

const canManage = (role: string, frontOfficeRole: string | null | undefined) =>
  isAssetManager(role, frontOfficeRole);

const canRead = (role: string) =>
  isAdminLike(role) || role === "FRONT_OFFICE" || role === "COACHING_STAFF";

export class ContactLogController {
  constructor(private service: ContactLogService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role } = requireUser(req);
      if (!canRead(role)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.list(assertCuid(req.params["partnerId"])));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, id: userId } = requireUser(req);
      if (!canManage(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(
        await this.service.create(assertCuid(req.params["partnerId"]), req.body as CreateContactLogDto, userId),
      );
    } catch (err) { next(err); }
  };
}
