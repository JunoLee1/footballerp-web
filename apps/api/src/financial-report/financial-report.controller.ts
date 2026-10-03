import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { canWriteFinance } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { FinancialReportService } from "./financial-report.service";
import type { RevenueBreakdownDto } from "./financial-report.repo";

const canWrite = (role: string, foRole: string | null | undefined) =>
  canWriteFinance(role, foRole);

const canRead = (role: string, foRole: string | null | undefined) =>
  canWriteFinance(role, foRole) || (role === "FRONT_OFFICE" && foRole === "TD");

export class FinancialReportController {
  constructor(private service: FinancialReportService) {}

  set = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, id: userId } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const seasonId = Number(req.params["seasonId"]);
      const { totalRevenue, note, breakdown } = req.body as { totalRevenue: number; note?: string; breakdown?: RevenueBreakdownDto };
      if (!Number.isInteger(totalRevenue)) throw new AppError(400, "INVALID_REVENUE");
      const report = await this.service.set(seasonId, totalRevenue, note, breakdown, userId);
      res.status(200).json(report);
    } catch (err) { next(err); }
  };

  setBreakdown = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, id: userId } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const seasonId = Number(req.params["seasonId"]);
      const { note, ...breakdown } = req.body as RevenueBreakdownDto & { note?: string };
      const report = await this.service.setBreakdown(seasonId, breakdown, note, userId);
      res.status(200).json(report);
    } catch (err) { next(err); }
  };

  getRevenueLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canRead(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const seasonId = Number(req.params["seasonId"]);
      const logs = await this.service.getRevenueLogs(seasonId);
      res.json(logs);
    } catch (err) { next(err); }
  };

  setFromCSV = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const seasonId = Number(req.params["seasonId"]);
      if (!req.file) throw new AppError(400, "FILE_REQUIRED");
      const csvContent = req.file.buffer.toString("utf-8");
      const note = (req.body as { note?: string }).note;
      const report = await this.service.setFromCSV(seasonId, csvContent, note);
      res.status(200).json(report);
    } catch (err) { next(err); }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canRead(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const seasonId = Number(req.params["seasonId"]);
      const report = await this.service.get(seasonId);
      res.status(200).json(report);
    } catch (err) { next(err); }
  };

  getBudgetPlan = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canRead(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const seasonId = Number(req.params["seasonId"]);
      const result = await this.service.getComparison(seasonId);
      res.status(200).json(result);
    } catch (err) { next(err); }
  };

  upsertBudgetPlan = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const seasonId = Number(req.params["seasonId"]);
      const plan = await this.service.upsertBudgetPlan(seasonId, req.body);
      res.status(200).json(plan);
    } catch (err) { next(err); }
  };

  optimize = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const seasonId = Number(req.params["seasonId"]);
      const result = await this.service.optimize(seasonId);
      res.status(200).json(result);
    } catch (err) { next(err); }
  };

  addOverride = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, id: userId } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const seasonId = Number(req.params["seasonId"]);
      const { category, amount, reason } = req.body as { category: string; amount: number; reason: string };
      const log = await this.service.addOverride(seasonId, category, amount, reason, userId);
      res.status(201).json(log);
    } catch (err) { next(err); }
  };

  getPayrollByMonth = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canRead(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const seasonId = Number(req.params["seasonId"]);
      const result = await this.service.getPayrollByMonth(seasonId);
      res.json(result);
    } catch (err) { next(err); }
  };

  approveOverride = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, id: userId } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const logId = String(req.params["logId"]);
      const result = await this.service.approveOverride(logId, userId);
      res.json(result);
    } catch (err) { next(err); }
  };

  rejectOverride = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, id: userId } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const logId = String(req.params["logId"]);
      const { reviewNote } = req.body as { reviewNote: string };
      const result = await this.service.rejectOverride(logId, userId, reviewNote);
      res.json(result);
    } catch (err) { next(err); }
  };

  setFromPrevSeason = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const seasonId = Number(req.params["seasonId"]);
      const { prevSeasonId } = req.body as { prevSeasonId: number };
      if (!prevSeasonId) throw new AppError(400, "PREV_SEASON_ID_REQUIRED");
      const report = await this.service.setFromPrevSeasonActuals(prevSeasonId, seasonId);
      res.status(200).json(report);
    } catch (err) { next(err); }
  };

  autoFillRevenue = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const seasonId = Number(req.params["seasonId"]);

      // ?lookback=N (default 3). 유효하지 않으면 default fallback.
      const raw = req.query["lookback"];
      const parsed = raw !== undefined ? Number(raw) : NaN;
      const lookback = Number.isInteger(parsed) && parsed >= 1 ? parsed : 3;

      const report = await this.service.autoFillRevenueFromPrevSeasons(seasonId, lookback);
      res.status(200).json(report);
    } catch (err) { next(err); }
  };

  autoGenerateBudget = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const seasonId = Number(req.params["seasonId"]);
      const body = req.body as { growthRate?: number; contingencyRate?: number };
      const opts: { growthRate?: number; contingencyRate?: number } = {};
      if (body.growthRate !== undefined) opts.growthRate = body.growthRate;
      if (body.contingencyRate !== undefined) opts.contingencyRate = body.contingencyRate;
      const result = await this.service.autoGenerateBudgetPlan(seasonId, opts);
      res.status(200).json(result);
    } catch (err) { next(err); }
  };

  getPnL = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canRead(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const seasonId = Number(req.params["seasonId"]);
      const data = await this.service.getPnL(seasonId);
      res.status(200).json(data);
    } catch (err) { next(err); }
  };

  getWithLedger = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canRead(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const seasonId = Number(req.params["seasonId"]);
      const data = await this.service.getReportWithLedger(seasonId);
      res.status(200).json(data);
    } catch (err) { next(err); }
  };

  overrideCarryOver = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, id: userId } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const seasonId = Number(req.params["seasonId"]);
      const { amount, reason } = req.body as { amount: number; reason: string };
      const result = await this.service.overrideCarryOver(seasonId, { amount, reason }, userId);
      res.status(200).json(result);
    } catch (err) { next(err); }
  };
}
