import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { isAdminLike } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { MedicalExpenseService } from "./medical-expense.service";

function isMedical(req: Request) {
  return req.user?.role === "COACHING_STAFF" && req.user?.coachingRole === "MEDICAL";
}

function isMedicalDirector(req: Request) {
  return req.user?.role === "COACHING_STAFF" && req.user?.coachingRole === "MEDICAL_DIRECTOR";
}

function isAdmin(req: Request) {
  return isAdminLike(req.user?.role ?? '');
}

export class MedicalExpenseController {
  constructor(private service: MedicalExpenseService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      res.json(await this.service.list(user.id, user.role, user.coachingRole ?? null));
    } catch (err) {
      next(err);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const expense = await this.service.get(String(req.params["id"]));
      const canAccess =
        isAdmin(req) ||
        isMedicalDirector(req) ||
        expense.submittedById === requireUser(req).id;
      if (!canAccess) throw new AppError(403, "FORBIDDEN");
      res.json(expense);
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isMedical(req)) throw new AppError(403, "FORBIDDEN");
      const { receiptDate, costCategory, totalAmount, payerType, injuryId, playerId, description } = req.body;
      const file = req.file;
      res.status(201).json(
        await this.service.create({
          submittedById: requireUser(req).id,
          receiptDate: new Date(receiptDate),
          costCategory,
          totalAmount: Number(totalAmount),
          payerType,
          ...(injuryId && { injuryId: Number(injuryId) }),
          ...(playerId && { playerId }),
          ...(description && { description }),
          ...(file && { fileUrl: (file as any).gcsUrl, fileName: file.originalname }),
        }),
      );
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { receiptDate, costCategory, totalAmount, payerType, injuryId, playerId, description } = req.body;
      const file = req.file;
      res.json(
        await this.service.update(String(req.params["id"]), requireUser(req).id, {
          ...(receiptDate !== undefined && { receiptDate: new Date(receiptDate) }),
          ...(costCategory !== undefined && { costCategory }),
          ...(totalAmount !== undefined && { totalAmount: Number(totalAmount) }),
          ...(payerType !== undefined && { payerType }),
          ...(injuryId !== undefined && { injuryId: injuryId ? Number(injuryId) : null }),
          ...(playerId !== undefined && { playerId: playerId || null }),
          ...(description !== undefined && { description }),
          ...(file && { fileUrl: (file as any).gcsUrl, fileName: file.originalname }),
        }),
      );
    } catch (err) {
      next(err);
    }
  };

  submit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.submit(String(req.params["id"]), requireUser(req).id));
    } catch (err) {
      next(err);
    }
  };

  leaderApprove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isMedicalDirector(req)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.leaderApprove(String(req.params["id"]), requireUser(req).id));
    } catch (err) {
      next(err);
    }
  };

  leaderReject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isMedicalDirector(req)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.leaderReject(String(req.params["id"]), requireUser(req).id, req.body.reason));
    } catch (err) {
      next(err);
    }
  };

  approve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isAdmin(req)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.approve(String(req.params["id"]), requireUser(req).id));
    } catch (err) {
      next(err);
    }
  };

  reject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isAdmin(req)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.reject(String(req.params["id"]), requireUser(req).id, req.body.reason));
    } catch (err) {
      next(err);
    }
  };
}
