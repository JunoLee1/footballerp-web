import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { isAdminLike } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { PartnerService } from "./partner.service";
import { PartnerType } from "../generated/enums";
import { assertCuid } from "../lib/cuidGuard";

const isAssetManager = (role: string, frontOfficeRole: string | null | undefined) =>
  isAdminLike(role) || (role === "FRONT_OFFICE" && frontOfficeRole === "ASSET_MANAGER");

const canManage = (role: string, frontOfficeRole: string | null | undefined) =>
  isAssetManager(role, frontOfficeRole) || (role === "FRONT_OFFICE" && frontOfficeRole === "EQUIPMENT_MANAGER");

const canRead = (role: string) =>
  isAdminLike(role) || role === "FRONT_OFFICE" || role === "COACHING_STAFF";

export class PartnerController {
  constructor(private service: PartnerService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canRead(user.role)) throw new AppError(403, "FORBIDDEN");
      const rawType = req.query["type"] as string | undefined;
      if (rawType && !Object.values(PartnerType).includes(rawType as PartnerType)) {
        throw new AppError(400, "INVALID_PARTNER_TYPE");
      }
      res.status(200).json(await this.service.list(rawType as PartnerType | undefined));
    } catch (err) { next(err); }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canRead(user.role)) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.getById(assertCuid(req.params["id"])));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canManage(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(await this.service.create(req.body));
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canManage(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.update(assertCuid(req.params["id"]), req.body));
    } catch (err) { next(err); }
  };

  createContract = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!isAssetManager(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(await this.service.createContract(assertCuid(req.params["id"]), req.body));
    } catch (err) { next(err); }
  };

  updateContract = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!isAssetManager(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.updateContract(
        assertCuid(req.params["id"]),
        assertCuid(req.params["contractId"]),
        req.body,
      ));
    } catch (err) { next(err); }
  };
}
