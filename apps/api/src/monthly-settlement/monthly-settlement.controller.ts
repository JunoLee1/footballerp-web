import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { canReadFinance, canWriteFinance, isAdminLike } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { assertCuid } from "../lib/cuidGuard";
import { MonthlySettlementService } from "./monthly-settlement.service";
import { generateSettlementExcel } from "./monthly-settlement.excel";
import type { GenerateSettlementDto } from "./dto/monthly-settlement.dto";

export class MonthlySettlementController {
  constructor(private service: MonthlySettlementService) {}

  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canReadFinance(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const seasonId = req.query["seasonId"] ? Number(req.query["seasonId"]) : undefined;
      const list = await this.service.getAll(seasonId);
      res.status(200).json(list);
    } catch (err) { next(err); }
  };

  generate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: userId } = requireUser(req);
      if (!canReadFinance(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const { seasonId, year, month } = req.body as GenerateSettlementDto;
      if (!seasonId || !year || !month) throw new AppError(400, "INVALID_BODY");
      const report = await this.service.generate(seasonId, year, month, userId);
      res.status(200).json(report);
    } catch (err) { next(err); }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canReadFinance(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const id = assertCuid(req.params["id"]);
      const report = await this.service.getById(id);
      if (!report) throw new AppError(404, "SETTLEMENT_NOT_FOUND");
      res.status(200).json(report);
    } catch (err) { next(err); }
  };

  updateNote = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canReadFinance(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const id = assertCuid(req.params["id"]);
      const { note } = req.body as { note: string };
      if (!note) throw new AppError(400, "NOTE_REQUIRED");
      const report = await this.service.updateNote(id, note);
      res.status(200).json(report);
    } catch (err) { next(err); }
  };

  submitFirst = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: userId } = requireUser(req);
      if (!canReadFinance(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const id = assertCuid(req.params["id"]);
      const report = await this.service.submitFirst(id, userId);
      res.status(200).json(report);
    } catch (err) { next(err); }
  };

  approveFirst = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: userId } = requireUser(req);
      if (!canWriteFinance(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const id = assertCuid(req.params["id"]);
      const report = await this.service.approveFirst(id, userId);
      res.status(200).json(report);
    } catch (err) { next(err); }
  };

  approve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, id: userId } = requireUser(req);
      if (!isAdminLike(role)) throw new AppError(403, "FORBIDDEN");
      const id = assertCuid(req.params["id"]);
      const report = await this.service.approve(id, userId);
      res.status(200).json(report);
    } catch (err) { next(err); }
  };

  reject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWriteFinance(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const id = assertCuid(req.params["id"]);
      const { reason } = req.body as { reason: string };
      if (!reason) throw new AppError(400, "REASON_REQUIRED");
      const report = await this.service.reject(id, reason);
      res.status(200).json(report);
    } catch (err) { next(err); }
  };

  export = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canReadFinance(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const report = await this.service.getForExport(assertCuid(req.params["id"]));
      if (!report) throw new AppError(404, "SETTLEMENT_NOT_FOUND");
      const buf = await generateSettlementExcel(report);
      const year = report.year; const month = report.month;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="settlement-${year}-${month}.xlsx"`);
      res.send(buf);
    } catch (err) { next(err); }
  };
}
