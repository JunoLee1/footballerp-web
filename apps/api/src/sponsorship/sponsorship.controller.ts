import { Request, Response, NextFunction } from "express";
import { assertCuid } from "../lib/cuidGuard";
import { AppError } from "../lib/appError";
import { isAdminLike, canWriteFinance } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import type { SponsorshipService } from "./sponsorship.service";
import type { CreateSponsorshipDto, UpdateSponsorshipDto, SponsorshipListQuery, MarkPaidDto } from "./dto/sponsorship.dto";

const canRead = (role: string) =>
  isAdminLike(role) || role === "FRONT_OFFICE";

const canWrite = (role: string, foRole: string | null | undefined) =>
  canWriteFinance(role, foRole);

export class SponsorshipController {
  constructor(private service: SponsorshipService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canRead(user.role)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.list(req.query as SponsorshipListQuery));
    } catch (err) { next(err); }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canRead(user.role)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.get(assertCuid(req.params["id"])));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, id: userId } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(await this.service.create(req.body as CreateSponsorshipDto, userId));
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, id: userId } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.update(assertCuid(req.params["id"]), req.body as UpdateSponsorshipDto, userId));
    } catch (err) { next(err); }
  };

  getRoiSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canRead(user.role)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.getRoiSummary());
    } catch (err) { next(err); }
  };

  getExpiring = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canRead(user.role)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.findExpiringContracts(Number(req.query["days"]) || 30));
    } catch (err) { next(err); }
  };

  getPayments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.getPayments(assertCuid(req.params["id"])));
    } catch (err) { next(err); }
  };

  markPaid = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, id: userId } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.json(
        await this.service.markPaid(
          assertCuid(req.params["id"]),
          Number(req.params["paymentId"]),
          userId,
          req.body as MarkPaidDto,
        ),
      );
    } catch (err) { next(err); }
  };

  // PB6: soft-delete a sponsorship contract
  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, id: userId } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      await this.service.delete(assertCuid(req.params["id"]), userId);
      res.status(204).send();
    } catch (err) { next(err); }
  };
}
