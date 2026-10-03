import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { isAdminLike } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { assertCuid } from "../lib/cuidGuard";
import { PiiAccessService } from "./pii-access.service";

export class PiiAccessController {
  constructor(private service: PiiAccessService) {}

  // POST /pii-access/requests — 긴급 열람 요청 (로그인 유저 본인)
  request = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: requesterId } = requireUser(req);
      const { targetUserId, reason } = req.body as { targetUserId?: unknown; reason?: unknown };
      if (typeof targetUserId !== "string" || typeof reason !== "string") {
        throw new AppError(400, "INVALID_BODY");
      }
      res.status(201).json(await this.service.requestAccess(requesterId, targetUserId, reason));
    } catch (err) { next(err); }
  };

  // GET /pii-access/requests — 대기 중인 요청 목록 (ADMIN만)
  listPending = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role } = requireUser(req);
      if (!isAdminLike(role)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.listPending());
    } catch (err) { next(err); }
  };

  // GET /pii-access/requests/mine — 내가 보낸 요청 목록
  myRequests = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = requireUser(req);
      res.json(await this.service.myRequests(id));
    } catch (err) { next(err); }
  };

  // PATCH /pii-access/requests/:id/approve (ADMIN만)
  approve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: reviewerId, role } = requireUser(req);
      if (!isAdminLike(role)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.approve(assertCuid(req.params["id"]), reviewerId));
    } catch (err) { next(err); }
  };

  // PATCH /pii-access/requests/:id/deny (ADMIN만)
  deny = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: reviewerId, role } = requireUser(req);
      if (!isAdminLike(role)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.deny(assertCuid(req.params["id"]), reviewerId));
    } catch (err) { next(err); }
  };
}
