import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import multer from "multer";
import { FinancialReportController } from "./financial-report.controller";
import { FinancialReportService } from "./financial-report.service";
import { FinancialReportRepository } from "./financial-report.repo";
import { KnapsackService } from "../budget/knapsack.service";
import { getPrisma } from "../lib/prisma";
import { expenseCategoryService } from "../expense-category/expense-category.routes";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new FinancialReportRepository(getPrisma());
const knapsack = new KnapsackService();
const service = new FinancialReportService(repo, knapsack, expenseCategoryService);
const controller = new FinancialReportController(service);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1 * 1024 * 1024 } });

router.get("/prev-season-revenue", auth, async (req, res, next) => {
  try {
    const seasonId = Number(req.query["seasonId"]);
    if (!seasonId) { res.json({ prevRevenue: null }); return; }
    const prisma = (await import("../lib/prisma")).getPrisma();
    const cur = await prisma.season.findUnique({ where: { id: seasonId }, select: { endDate: true } });
    if (!cur) { res.json({ prevRevenue: null }); return; }
    const prev = await prisma.season.findFirst({
      where: { endDate: { lt: cur.endDate } },
      orderBy: { endDate: "desc" },
      select: { id: true },
    });
    if (!prev) { res.json({ prevRevenue: null }); return; }
    const report = await prisma.financialReport.findUnique({
      where: { seasonId: prev.id },
      select: { totalRevenue: true },
    });
    res.json({ prevRevenue: report?.totalRevenue ?? null });
  } catch (err) { next(err); }
});

router.post("/:seasonId",                   auth, controller.set);
router.post("/:seasonId/from-prev-season",      auth, controller.setFromPrevSeason);
router.post("/:seasonId/revenue/auto-fill",     auth, controller.autoFillRevenue);
router.put("/:seasonId/revenue",            auth, controller.setBreakdown);
router.post("/:seasonId/csv",               auth, upload.single("file"), controller.setFromCSV);
router.get("/:seasonId/pl",                 auth, controller.getPnL);
router.get("/:seasonId/with-ledger",        auth, controller.getWithLedger);
router.get("/:seasonId",                    auth, controller.get);
router.get("/:seasonId/budget",             auth, controller.getBudgetPlan);
router.put("/:seasonId/budget",             auth, controller.upsertBudgetPlan);
router.post("/:seasonId/budget/optimize",   auth, controller.optimize);
router.post("/:seasonId/budget/override",                      auth, controller.addOverride);
router.post("/:seasonId/budget/override/:logId/approve",       auth, controller.approveOverride);
router.post("/:seasonId/budget/override/:logId/reject",        auth, controller.rejectOverride);
router.post("/:seasonId/budget/auto-generate", auth, controller.autoGenerateBudget);
router.get("/:seasonId/payroll/monthly",        auth, controller.getPayrollByMonth);
router.get("/:seasonId/revenue-log",            auth, controller.getRevenueLogs);
router.patch("/:seasonId/carryover",            auth, controller.overrideCarryOver);

export default router;
