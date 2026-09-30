import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { canReadFinance, canWriteFinance } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { assertCuid } from "../lib/cuidGuard";
import { OperatingExpenseService } from "./operating-expense.service";
import type { UpdateOperatingExpenseDto } from "./dto/operating-expense.dto";

const canRead = (role: string, foRole: string | null | undefined, deptCategories?: string[]) =>
  canReadFinance(role, foRole, deptCategories) || (role === "FRONT_OFFICE" && foRole === "TD");

const canCreate = (role: string, foRole: string | null | undefined, deptCategories?: string[]) =>
  canWriteFinance(role, foRole, deptCategories);

const canDelete = (role: string, foRole: string | null | undefined, deptCategories?: string[]) =>
  canWriteFinance(role, foRole, deptCategories);

export class OperatingExpenseController {
  constructor(private service: OperatingExpenseService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, clubId } = requireUser(req);
      if (!canRead(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const seasonId = Number(req.query["seasonId"]);
      if (!seasonId) throw new AppError(400, "SEASON_ID_REQUIRED");
      const expenses = await this.service.list(seasonId, clubId);
      res.json(expenses);
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { role, frontOfficeRole, departmentCategories, id: userId } = user;
      if (!canCreate(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const { seasonId, category, costType, amount, date, note, budgetLineId } = req.body as {
        seasonId: number;
        category: string;
        costType?: "FIXED" | "VARIABLE" | "CONTINGENCY";
        amount: number;
        date: string;
        note?: string;
        budgetLineId?: number;
      };
      const expense = await this.service.create({
        seasonId, category, amount, date,
        ...(costType !== undefined && { costType }),
        ...(note !== undefined && { note }),
        ...(budgetLineId !== undefined && { budgetLineId }),
        createdById: userId,
        actorClubId: user.clubId,
      });
      res.status(201).json(expense);
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, clubId } = requireUser(req);
      const id = assertCuid(req.params["id"]);
      const body = req.body as UpdateOperatingExpenseDto;
      const data: UpdateOperatingExpenseDto = {};
      if (body.amount !== undefined) data.amount = body.amount;
      if (body.category !== undefined) data.category = body.category;
      if (body.note !== undefined) data.note = body.note;
      const result = await this.service.update(id, userId, data, clubId);
      res.json(result);
    } catch (err) { next(err); }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: userId, clubId } = requireUser(req);
      if (!canDelete(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const id = assertCuid(req.params["id"]);
      const { reason } = req.body as { reason?: string };
      if (!reason?.trim()) throw new AppError(400, "DELETION_REASON_REQUIRED");
      await this.service.delete(id, userId, role, reason.trim(), clubId);
      res.status(204).end();
    } catch (err) { next(err); }
  };
}
