import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { requireUser } from "../lib/authMiddleware";
import { requireClubScope } from "../lib/permissions";
import { AssetRequestService } from "./asset-request.service";
import { CreateAssetRequestDto, ListAssetRequestQuery, RejectDto } from "./dto/asset-request.dto";

export class AssetRequestController {
  constructor(private service: AssetRequestService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const clubScope = requireClubScope(user);
      const { filter, status } = req.query as ListAssetRequestQuery;
      const rows = await this.service.list(user.id, user.role, filter, status, clubScope);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clubScope = requireClubScope(requireUser(req));
      const id = Number(req.params["id"]);
      if (!Number.isFinite(id)) throw new AppError(400, "INVALID_ID");
      const row = await this.service.getById(id, clubScope);
      res.json(row);
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const clubScope = requireClubScope(user);
      const dto = req.body as CreateAssetRequestDto;
      const row = await this.service.create(dto, user.id, clubScope);
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  };

  submit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const clubScope = requireClubScope(user);
      const id = Number(req.params["id"]);
      const row = await this.service.submit(id, user.id, clubScope);
      res.json(row);
    } catch (err) {
      next(err);
    }
  };

  leaderApprove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const clubScope = requireClubScope(user);
      const id = Number(req.params["id"]);
      const row = await this.service.leaderApprove(id, user.id, clubScope);
      res.json(row);
    } catch (err) {
      next(err);
    }
  };

  leaderReject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const clubScope = requireClubScope(user);
      const id = Number(req.params["id"]);
      const { reason } = (req.body ?? {}) as RejectDto;
      const row = await this.service.leaderReject(id, user.id, reason, clubScope);
      res.json(row);
    } catch (err) {
      next(err);
    }
  };

  approve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const clubScope = requireClubScope(user);
      const id = Number(req.params["id"]);
      const row = await this.service.approve(id, user.id, clubScope);
      res.json(row);
    } catch (err) {
      next(err);
    }
  };

  reject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const clubScope = requireClubScope(user);
      const id = Number(req.params["id"]);
      const { reason } = (req.body ?? {}) as RejectDto;
      const row = await this.service.reject(id, user.id, reason, clubScope);
      res.json(row);
    } catch (err) {
      next(err);
    }
  };

  cancel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const clubScope = requireClubScope(user);
      const id = Number(req.params["id"]);
      const row = await this.service.cancel(id, user.id, clubScope);
      res.json(row);
    } catch (err) {
      next(err);
    }
  };

  fulfill = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const clubScope = requireClubScope(user);
      const id = Number(req.params["id"]);
      const row = await this.service.fulfill(id, user.id, user.role, user.frontOfficeRole, clubScope);
      res.json(row);
    } catch (err) {
      next(err);
    }
  };
}
