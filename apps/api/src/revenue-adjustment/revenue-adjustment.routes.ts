import { Router, Request, Response, NextFunction } from "express";
import { auth } from "../lib/authMiddleware";
import { canReadFinance, canWriteFinance } from "../lib/permissions";
import { getPrisma } from "../lib/prisma";
import { AppError } from "../lib/appError";
import { RevenueAdjustmentRepository } from "./revenue-adjustment.repo";
import { RevenueAdjustmentService } from "./revenue-adjustment.service";
import type { RevenueField } from "../generated/client";
const router = Router();
const repo = new RevenueAdjustmentRepository(getPrisma());
export const revenueAdjustmentService = new RevenueAdjustmentService(repo, getPrisma());

const checkReadFinance = (req: Request, res: Response, next: NextFunction) => {
  const { role, frontOfficeRole } = req.user!;
  if (!canReadFinance(role, frontOfficeRole)) return next(new AppError(403, "FORBIDDEN"));
  next();
};

const checkWriteFinance = (req: Request, res: Response, next: NextFunction) => {
  const { role, frontOfficeRole } = req.user!;
  if (!canWriteFinance(role, frontOfficeRole)) return next(new AppError(403, "FORBIDDEN"));
  next();
};

// GET /revenue-adjustment?financialReportId=1 or ?monthlyReportId=1
router.get("/", auth, checkReadFinance, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const financialReportId = req.query["financialReportId"] !== undefined
      ? String(req.query["financialReportId"])
      : undefined;
    const monthlyReportId = req.query["monthlyReportId"] !== undefined
      ? String(req.query["monthlyReportId"])
      : undefined;

    const items = await revenueAdjustmentService.list({
      ...(financialReportId !== undefined && { financialReportId }),
      ...(monthlyReportId !== undefined && { monthlyReportId }),
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// GET /revenue-adjustment/drilldown?field=TICKET&year=2026&month=8&financialReportId=1
router.get("/drilldown", auth, checkReadFinance, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const field = req.query["field"] as RevenueField;
    const year = Number(req.query["year"]);
    const month = req.query["month"] !== undefined ? Number(req.query["month"]) : undefined;
    const financialReportId = req.query["financialReportId"] !== undefined
      ? String(req.query["financialReportId"])
      : undefined;
    const monthlyReportId = req.query["monthlyReportId"] !== undefined
      ? String(req.query["monthlyReportId"])
      : undefined;

    if (!field) return next(new AppError(400, "MISSING_FIELD"));
    if (!year) return next(new AppError(400, "MISSING_YEAR"));

    const result = await revenueAdjustmentService.drilldown({
      field,
      year,
      ...(month !== undefined && { month }),
      ...(financialReportId !== undefined && { financialReportId }),
      ...(monthlyReportId !== undefined && { monthlyReportId }),
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /revenue-adjustment — FINANCE_MANAGER+ only
router.post("/", auth, checkWriteFinance, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { financialReportId, monthlyReportId, field, delta, memo } = req.body;
    const createdById = req.user!.id;

    if (!field) return next(new AppError(400, "MISSING_FIELD"));
    if (delta === undefined || delta === null) return next(new AppError(400, "MISSING_DELTA"));

    const item = await revenueAdjustmentService.create({
      field: field as RevenueField,
      delta: Number(delta),
      createdById,
      ...(financialReportId !== undefined && { financialReportId: String(financialReportId) }),
      ...(monthlyReportId !== undefined && { monthlyReportId: String(monthlyReportId) }),
      ...(memo !== undefined && { memo: String(memo) }),
    });
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

export { router as revenueAdjustmentRouter };
