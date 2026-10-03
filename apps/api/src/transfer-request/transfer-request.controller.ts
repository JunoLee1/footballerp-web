import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { isAdminLike } from "../lib/permissions";
import { TransferRequestService } from "./transfer-request.service";

export class TransferRequestController {
  constructor(private service: TransferRequestService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json(await this.service.list(req.query));
    } catch (err) { next(err); }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json(await this.service.getById(Number(req.params["id"])));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role } = req.user!;
      if (role !== "AGENT") throw new AppError(403, "FORBIDDEN");
      res.status(201).json(await this.service.create(req.body, req.user!.id));
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role } = req.user!;
      if (role !== "AGENT") throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.update(Number(req.params["id"]), req.body));
    } catch (err) { next(err); }
  };

  submit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role } = req.user!;
      if (role !== "AGENT") throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.submit(Number(req.params["id"]), req.user!.id));
    } catch (err) { next(err); }
  };

  review = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role } = req.user!;
      if (role !== "FRONT_OFFICE") throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.review(Number(req.params["id"]), req.body, req.user!.id));
    } catch (err) { next(err); }
  };

  confirm = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role } = req.user!;
      if (!isAdminLike(role)) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.confirmStep(Number(req.params["id"]), req.body, req.user!.id));
    } catch (err) { next(err); }
  };

  recordMedicalResult = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, coachingRole } = req.user!;
      if (role !== "COACHING_STAFF" || (coachingRole !== "MEDICAL" && coachingRole !== "MEDICAL_DIRECTOR")) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.recordMedicalResult(Number(req.params["id"]), req.body, req.user!.id));
    } catch (err) { next(err); }
  };

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role } = req.user!;
      if (!isAdminLike(role)) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.register(Number(req.params["id"])));
    } catch (err) { next(err); }
  };

  addNegotiationLog = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await this.service.addNegotiationLog(Number(req.params["id"]), req.body, req.user!.id));
    } catch (err) { next(err); }
  };

  getNegotiationLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(200).json(await this.service.getNegotiationLogs(Number(req.params["id"])));
    } catch (err) { next(err); }
  };

  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role } = req.user!;
      if (role !== "AGENT") throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.delete(Number(req.params["id"]), req.user!.id));
    } catch (err) { next(err); }
  };
}
