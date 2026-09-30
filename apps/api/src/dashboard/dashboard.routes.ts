import { auth } from "../lib/authMiddleware";
import { isAdminLike } from "../lib/permissions";
import { Router } from "express";
import { getPrisma } from "../lib/prisma";
import { DashboardRepository } from "./dashboard.repo";
import { DashboardService } from "./dashboard.service";
import { DashboardController } from "./dashboard.controller";
import { requireUser } from "../lib/authMiddleware";
import { canReadFinance } from "../lib/permissions";
import { AppError } from "../lib/appError";
import { getSeasonRevenueActuals } from "../lib/season-actuals";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new DashboardRepository(getPrisma());
const service = new DashboardService(repo);
const controller = new DashboardController(service);


router.get("/stats", auth, controller.getStats);

router.get("/youth-development", auth, async (req, res, next) => {
  try {
    const user = req.user as any;
    if (!isAdminLike(user.role) && !(user.role === "FRONT_OFFICE" && user.frontOfficeRole === "TD")) {
      return res.status(403).json({ message: "Forbidden" });
    }
    res.json(await service.getYouthDevelopmentStats());
  } catch (e) { next(e); }
});

router.get("/academy-finance", auth, async (req, res, next) => {
  try {
    const user = req.user as any;
    const foRole = user.frontOfficeRole;
    const allowedFoRoles = ["FINANCE_MANAGER", "TD"];
    if (!isAdminLike(user.role) && !(user.role === "FRONT_OFFICE" && allowedFoRoles.includes(foRole))) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const now = new Date();
    const year = Number(req.query.year ?? now.getFullYear());
    const month = Number(req.query.month ?? now.getMonth() + 1);
    res.json(await service.getAcademyFinanceStats(year, month));
  } catch (e) { next(e); }
});

router.get("/coach", auth, async (req, res, next) => {
  try {
    const user = req.user as any;
    const isCoach = user.role === "COACHING_STAFF";
    const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
    if (!isCoach && !isAdmin) {
      return res.status(403).json({ code: "FORBIDDEN" });
    }
    res.json(await service.getCoachDashboard());
  } catch (e) {
    next(e);
  }
});

// ── Finance dashboard ──────────────────────────────────────────────────────
router.get("/finance", auth, async (req, res, next) => {
  try {
    const { role, frontOfficeRole } = requireUser(req);
    if (!canReadFinance(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");

    const seasonId = req.query["seasonId"] ? Number(req.query["seasonId"]) : undefined;
    const year = req.query["year"] ? Number(req.query["year"]) : new Date().getFullYear();
    const month = req.query["month"] ? Number(req.query["month"]) : undefined;

    const prisma = getPrisma();

    // ── 1. DONUT: revenue breakdown ──────────────────────
    // Compute actuals live from source tables so switching seasons never shows
    // stale FinancialReport values (which double as prev-season forecast when
    // auto-fill has been run). Manual-only fields (BROADCAST/SUBSIDY/PARENT_COMPANY)
    // still come from FinancialReport since they have no system-of-record source.
    let seasonDonut: Record<string, number> = {};
    let monthlyDonut: Record<string, number> = {};

    if (seasonId) {
      // Actuals from source tables via shared helper (PR #311/#312 semantics preserved).
      // Manual-only fields (BROADCAST/SUBSIDY/PARENT_COMPANY) still come from FinancialReport
      // since they have no system-of-record source.
      const [actuals, fr] = await Promise.all([
        getSeasonRevenueActuals(seasonId).catch((e) => {
          if (e?.code === "SEASON_NOT_FOUND") return null;
          throw e;
        }),
        prisma.financialReport.findUnique({
          where: { seasonId },
          select: { plannedRevenueBroadcast: true, plannedRevenueSubsidy: true, plannedRevenueParentCompany: true },
        }),
      ]);
      if (actuals) {
        seasonDonut = {
          TICKET:         actuals.plannedRevenueTicket,
          SPONSORSHIP:    actuals.plannedRevenueSponsorship,
          BROADCAST:      fr?.plannedRevenueBroadcast ?? 0,
          MERCHANDISE:    actuals.plannedRevenueMerchandise,
          SUBSIDY:        fr?.plannedRevenueSubsidy ?? 0,
          PARENT_COMPANY: fr?.plannedRevenueParentCompany ?? 0,
          ACADEMY_FEE:    actuals.plannedRevenueAcademyFee,
          OTHER:          actuals.plannedRevenueOther,
        };
      }
    }

    if (month && year) {
      // Monthly donut from LedgerEntry groupBy category
      const startDate = new Date(year, month - 1, 1);
      const endDate   = new Date(year, month, 1);
      const rows = await prisma.ledgerEntry.groupBy({
        by: ["category"],
        where: { type: "INCOME", createdAt: { gte: startDate, lt: endDate }, isRefund: false },
        _sum: { amountKrw: true },
      });
      const CATEGORY_TO_FIELD: Record<string, string> = {
        TICKET_SALES: "TICKET",
        SPONSORSHIP:  "SPONSORSHIP",
        MERCHANDISE:  "MERCHANDISE",
        ACADEMY_FEE:  "ACADEMY_FEE",
        OTHER:        "OTHER",
      };
      for (const row of rows) {
        const field = CATEGORY_TO_FIELD[row.category];
        if (field) {
          monthlyDonut[field] = (monthlyDonut[field] ?? 0) + Number(row._sum?.amountKrw?.toString() ?? "0");
        }
      }
    }

    // ── 2. TREND: last 12 months MonthlySettlementReport ──
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    const trendYear  = twelveMonthsAgo.getFullYear();
    const trendMonth = twelveMonthsAgo.getMonth() + 1;

    const settlements = await prisma.monthlySettlementReport.findMany({
      where: seasonId
        ? { seasonId, status: "APPROVED" }
        : {
            OR: [
              { year: { gt: trendYear } },
              { year: trendYear, month: { gte: trendMonth } },
            ],
            status: "APPROVED",
          },
      select: { year: true, month: true, totalRevenue: true, totalExpense: true, netIncome: true },
      orderBy: [{ year: "asc" }, { month: "asc" }],
      take: 12,
    });

    const trend = settlements.map(s => ({
      year: s.year,
      month: s.month,
      totalRevenue: s.totalRevenue,
      totalExpense: s.totalExpense,
      netIncome: s.netIncome,
    }));

    // ── 3. GAUGES ─────────────────────────────────────────
    let revenueAchievement = { actual: 0, target: 0 };
    let budgetConsumption  = { spent: 0, approved: 0 };
    let monthlyContribution = { monthly: 0, annualTarget: 0 };

    if (seasonId) {
      const fr = await prisma.financialReport.findUnique({
        where: { seasonId },
        select: { id: true, seasonId: true, totalRevenue: true },
      });

      if (fr) {
        // Revenue achievement: sum of APPROVED monthly reports vs totalRevenue target
        const approvedSum = await prisma.monthlySettlementReport.aggregate({
          where: { seasonId, status: "APPROVED" },
          _sum: { totalRevenue: true },
        });
        revenueAchievement = {
          actual: approvedSum._sum.totalRevenue ?? 0,
          target: fr.totalRevenue,
        };

        // Budget consumption: committed OpEx vs total budget lines
        const [opexSum, budgetLineSum] = await Promise.all([
          prisma.operatingExpense.aggregate({
            where: {
              seasonId,
              status: { in: ["FIRST_APPROVED", "APPROVED", "PAID"] },
              deletedAt: null,
            },
            _sum: { amount: true },
          }),
          prisma.budgetLine.aggregate({
            where: { budgetHeader: { seasonId } },
            _sum: { originalAmount: true },
          }),
        ]);
        budgetConsumption = {
          spent: Number(opexSum._sum.amount ?? 0),
          approved: Number(budgetLineSum._sum.originalAmount ?? 0),
        };

        // Monthly contribution
        if (month && year) {
          const monthlyReport = await prisma.monthlySettlementReport.findUnique({
            where: { seasonId_year_month: { seasonId, year, month } },
            select: { totalRevenue: true },
          });
          monthlyContribution = {
            monthly: monthlyReport?.totalRevenue ?? 0,
            annualTarget: fr.totalRevenue,
          };
        }
      }
    }

    res.json({
      donut: { season: seasonDonut, monthly: monthlyDonut },
      trend,
      gauges: { revenueAchievement, budgetConsumption, monthlyContribution },
    });
  } catch (err) { next(err); }
});

export default router;
