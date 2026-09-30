import { Request, Response, NextFunction } from "express";
import { AppError } from "../../lib/appError";
import { requireUser } from "../../lib/authMiddleware";
import { isAdminLike } from "../../lib/permissions";
import { assertCuid } from "../../lib/cuidGuard";
import type { DisposalService } from "./disposal.service";
import type { FmVerifyDto, GmApproveDto, RejectDisposalDto } from "./dto/disposal.dto";
import type { NotificationService } from "../../notification/notification.service";

const isFacilityManager = (req: Request) => {
  const user = requireUser(req);
  return isAdminLike(user.role) ||
    (user.role === "FRONT_OFFICE" && user.frontOfficeRole === "FACILITY_MANAGER");
};

const isGM = (req: Request) => {
  const user = requireUser(req);
  return isAdminLike(user.role) || user.role === "GM";
};

export class DisposalController {
  constructor(
    private service: DisposalService,
    private notifications: NotificationService,
  ) {}

  getVerification = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.getVerification(assertCuid(req.params.unitId)));
    } catch (err) { next(err); }
  };

  requestDisposal = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const result = await this.service.requestDisposal(assertCuid(req.params.unitId), user.id);
      void this.notifications.notifyDisposalRequested(result.equipment.item.name, result.equipmentId).catch(console.error);
      res.status(201).json(result);
    } catch (err) { next(err); }
  };

  fmVerify = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isFacilityManager(req)) throw new AppError(403, "FORBIDDEN");
      const user = requireUser(req);
      const result = await this.service.fmVerify(assertCuid(req.params.unitId), user.id, req.body as FmVerifyDto);
      if (result.equipment.isHighValue) {
        void this.notifications.notifyDisposalFMVerified(result.equipment.item.name, result.equipmentId).catch(console.error);
      }
      res.json(result);
    } catch (err) { next(err); }
  };

  gmApprove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isGM(req)) throw new AppError(403, "FORBIDDEN");
      const user = requireUser(req);
      res.json(await this.service.gmApprove(assertCuid(req.params.unitId), user.id, req.body as GmApproveDto));
    } catch (err) { next(err); }
  };

  rejectVerification = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isFacilityManager(req) && !isGM(req)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.rejectVerification(assertCuid(req.params.unitId), req.body as RejectDisposalDto));
    } catch (err) { next(err); }
  };
}
