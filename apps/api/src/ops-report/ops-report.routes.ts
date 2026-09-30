import { Router } from "express";
import { auth } from "../lib/authMiddleware";
import { getPrisma } from "../lib/prisma";
import { OpsReportRepository } from "./ops-report.repo";
import { OpsReportService } from "./ops-report.service";
import { OpsReportController } from "./ops-report.controller";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new OpsReportRepository(getPrisma());
const service = new OpsReportService(repo, getPrisma());
const controller = new OpsReportController(service);

router.get("/ops/kpi",       auth, controller.getOpsKpi);
router.get("/ops/annual",    auth, controller.getAnnualOps);
router.get("/budget/kpi",    auth, controller.getBudgetKpi);
router.get("/budget/annual", auth, controller.getAnnualBudget);
router.get("/budget-execution",              auth, controller.getBudgetExecutionByCategory);
router.get("/drill/notice-unread",           auth, controller.getDrillNoticeUnread);
router.get("/drill/attendance",              auth, controller.getDrillAttendance);
router.get("/drill/attendance-corrections",  auth, controller.drillAttendanceCorrections);
router.get("/drill/salary-distribution",     auth, controller.getDrillSalaryDistribution);
router.get("/drill/unregistered-attendance", auth, controller.getDrillUnregisteredAttendance);
router.get("/penalty-status",                auth, controller.getPenaltyStatus);
router.get("/partner-kpi",                   auth, controller.getPartnerKpi);
router.get("/sponsorship-vs-budget",         auth, controller.getSponsorshipVsBudget);

export default router;
