import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { requireUser } from "../lib/authMiddleware";
import { AssetRequestService } from "./asset-request.service";
import { CreateAssetRequestDto, ListAssetRequestQuery, RejectDto } from "./dto/asset-request.dto";

export class AssetRequestController {
  constructor(private service: AssetRequestService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, role, clubId } = requireUser(req);
      const { filter, status } = req.query as ListAssetRequestQuery;
      const rows = await this.service.list(userId, role, filter, status, clubId ?? undefined);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { clubId } = requireUser(req);
      const id = Number(req.params["id"]);
      if (!Number.isFinite(id)) throw new AppError(400, "INVALID_ID");
      const row = await this.service.getById(id, clubId ?? undefined);
      res.json(row);
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, clubId } = requireUser(req);
      const dto = req.body as CreateAssetRequestDto;
      const row = await this.service.create(dto, userId, clubId ?? undefined);
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  };

  submit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, clubId } = requireUser(req);
      const id = Number(req.params["id"]);
      const row = await this.service.submit(id, userId, clubId ?? undefined);
      res.json(row);
    } catch (err) {
      next(err);
    }
  };

  leaderApprove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, clubId } = requireUser(req);
      const id = Number(req.params["id"]);
      const row = await this.service.leaderApprove(id, userId, clubId ?? undefined);
      res.json(row);
    } catch (err) {
      next(err);
    }
  };

  leaderReject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, clubId } = requireUser(req);
      const id = Number(req.params["id"]);
      const { reason } = (req.body ?? {}) as RejectDto;
      const row = await this.service.leaderReject(id, userId, reason, clubId ?? undefined);
      res.json(row);
    } catch (err) {
      next(err);
    }
  };

  approve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, clubId } = requireUser(req);
      const id = Number(req.params["id"]);
      const row = await this.service.approve(id, userId, clubId ?? undefined);
      res.json(row);
    } catch (err) {
      next(err);
    }
  };

  reject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, clubId } = requireUser(req);
      const id = Number(req.params["id"]);
      const { reason } = (req.body ?? {}) as RejectDto;
      const row = await this.service.reject(id, userId, reason, clubId ?? undefined);
      res.json(row);
    } catch (err) {
      next(err);
    }
  };

  cancel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, clubId } = requireUser(req);
      const id = Number(req.params["id"]);
      const row = await this.service.cancel(id, userId, clubId ?? undefined);
      res.json(row);
    } catch (err) {
      next(err);
    }
  };

  fulfill = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, role, frontOfficeRole, clubId } = requireUser(req);
      const id = Number(req.params["id"]);
      const row = await this.service.fulfill(id, userId, role, frontOfficeRole, clubId ?? undefined);
      res.json(row);
    } catch (err) {
      next(err);
    }
  };
}
