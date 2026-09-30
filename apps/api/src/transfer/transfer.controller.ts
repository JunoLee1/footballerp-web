import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { isAdminLike } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { TransferService } from "./transfer.service";
import { RecallStatus } from "../generated/enums";

const intId = (raw: string | string[] | undefined): number => {
  if (typeof raw !== "string") throw new AppError(400, "INVALID_ID");
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(400, "INVALID_ID");
  return n;
};

export class TransferController {
  constructor(private service: TransferService) {}

  getByPlayer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json(await this.service.getByPlayer(String(req.params["playerId"])));
    } catch (err) { next(err); }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json(await this.service.getById(intId(req.params["id"])));
    } catch (err) { next(err); }
  };

  createTransfer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { role, frontOfficeRole } = user;
      if (!isAdminLike(role) && role !== "GM" && role !== "FRONT_OFFICE") throw new AppError(403, "FORBIDDEN");
      if (role === "FRONT_OFFICE") {
        const allowed = ["TD", "CONTRACT_MANAGER"];
        if (!frontOfficeRole || !allowed.includes(frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      }
      res.status(201).json(await this.service.createTransfer(req.body, user.id));
    } catch (err) { next(err); }
  };

  getRecalls = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role } = requireUser(req);
      if (!isAdminLike(role) && role !== "GM") throw new AppError(403, "FORBIDDEN");
      const raw = req.query["status"];
      let status: RecallStatus | undefined;
      if (raw !== undefined) {
        if (typeof raw !== "string" || !(Object.values(RecallStatus) as string[]).includes(raw)) {
          throw new AppError(400, "INVALID_STATUS");
        }
        status = raw as RecallStatus;
      }
      res.status(200).json(await this.service.getRecalls(status));
    } catch (err) { next(err); }
  };

  createRecall = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      res.status(201).json(await this.service.createRecall(req.body, user.id));
    } catch (err) { next(err); }
  };

  updateRecallStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (user.role !== "GM") throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.updateRecallStatus(intId(req.params["id"]), req.body, user.id));
    } catch (err) { next(err); }
  };

  exportLoanIn = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      const isAdmin = isAdminLike(role);
      const isGMRole = role === "GM";
      const isFrontOffice = role === "FRONT_OFFICE" && ["TD"].includes(frontOfficeRole ?? "");
      if (!isAdmin && !isGMRole && !isFrontOffice) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.exportLoanIn(intId(req.params["id"])));
    } catch (err) { next(err); }
  };
}
