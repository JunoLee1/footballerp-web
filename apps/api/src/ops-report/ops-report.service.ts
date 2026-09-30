import { PrismaClient } from "../generated/client";
import { AppError } from "../lib/appError";
import { OpsReportRepository, OpsSnapshotData } from "./ops-report.repo";

export interface NoticeUnreadDrillRow {
  userId: string;
  name: string;
  unreadCount: number;
  unreadTitles: string[];
}

export interface AttendanceDrillRow {
  playerId: string;
  playerName: string;
  position: string | null;
  teamId: number | null;
  present: number;
  lateUnauth: number;
  absentUnauth: number;
  authorizedAbsence: number;
  effectiveAbsences: number;
}

export interface PenaltyStatusRow {
  playerId: string;
  playerName: string;
  effectiveAbsences: number;
  status: "TRIGGERED" | "WARNING" | "NORMAL";
}

export class OpsReportService {
  constructor(
    private repo: OpsReportRepository,
    private prisma: PrismaClient,
  ) {}

  async computeOpsKpi(seasonId: number, year: number, month: number): Promise<OpsSnapshotData> {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const [
      totalFees, paidFees, delinquentFees,
      totalBudgetCeiling, totalActualSpend,
      overrideCount,
      totalRegistrations, approvedRegistrations,
      sessions,
      presentResults,
      totalNotifications, readNotifications,
      ticketResult,
      totalSettlements, approvedSettlements,
    ] = await Promise.all([
      // AcademyFee uses year/month fields, not createdAt, for period filtering
      this.prisma.academyFee.count({ where: { year, month } }),
      this.prisma.academyFee.count({ where: { year, month, status: "PAID" } }),
      this.prisma.academyFee.count({ where: { year, month, status: { in: ["OVERDUE", "LOCKED"] } } }),
      this.prisma.budgetCategoryPlan.findMany({
        where: { financialReport: { seasonId } },
        select: { mandatoryMinimum: true, knapsackAllocated: true },
      }).then((plans) => plans.reduce((sum, p) => sum + p.mandatoryMinimum + (p.knapsackAllocated ?? 0), 0)),
      this.prisma.operatingExpense.aggregate({
        where: { seasonId },
        _sum: { amount: true },
      }).then((r) => r._sum.amount ?? 0),
      this.prisma.budgetOverrideLog.count({
        where: { financialReport: { seasonId }, createdAt: { gte: start, lt: end } },
      }),
      // YouthRegistration has no seasonId — filter by month window via createdAt
      this.prisma.youthRegistration.count({ where: { createdAt: { gte: start, lt: end } } }),
      this.prisma.youthRegistration.count({
        where: { createdAt: { gte: start, lt: end }, status: "CONTRACTED" },
      }),
      // TrainingSession has seasonId directly
      this.prisma.trainingSession.findMany({
        where: { seasonId, date: { gte: start, lt: end }, isApproved: true },
        select: { id: true },
      }),
      // TrainingResult.attendance (not attendanceStatus)
      this.prisma.trainingResult.count({
        where: {
          session: { seasonId, date: { gte: start, lt: end }, isApproved: true },
          attendance: "PRESENT",
        },
      }),
      this.prisma.notification.count({ where: { createdAt: { gte: start, lt: end } } }),
      this.prisma.notification.count({ where: { createdAt: { gte: start, lt: end }, readAt: { not: null } } }),
      this.prisma.salesRecord.aggregate({
        where: { type: "TICKET", match: { seasonId } },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      // MonthlySettlementReport uses year/month fields for period filtering
      this.prisma.monthlySettlementReport.count({ where: { seasonId, year, month } }),
      this.prisma.monthlySettlementReport.count({ where: { seasonId, year, month, status: "APPROVED" } }),
    ]);

    // If no academy fee billing records exist for the requested month,
    // fall back to the most recent month that has data
    let effectiveTotalFees = totalFees;
    let effectivePaidFees = paidFees;
    let effectiveDelinquentFees = delinquentFees;
    if (totalFees === 0) {
      const latest = await this.prisma.academyFee.findFirst({
        where: { year: { lte: year }, month: { lte: month } },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        select: { year: true, month: true },
      });
      if (latest) {
        [effectiveTotalFees, effectivePaidFees, effectiveDelinquentFees] = await Promise.all([
          this.prisma.academyFee.count({ where: { year: latest.year, month: latest.month } }),
          this.prisma.academyFee.count({ where: { year: latest.year, month: latest.month, status: "PAID" } }),
          this.prisma.academyFee.count({ where: { year: latest.year, month: latest.month, status: { in: ["OVERDUE", "LOCKED"] } } }),
        ]);
      }
    }

    const totalSessions = sessions.length;
    const rate = (num: number, den: number) => den === 0 ? 0 : Math.round((num / den) * 1000) / 10;

    return {
      feeCollectionRate: rate(effectivePaidFees, effectiveTotalFees),
      feeDelinquencyRate: rate(effectiveDelinquentFees, effectiveTotalFees),
      monthlySettlementRate: rate(approvedSettlements, totalSettlements),
      budgetExecutionRate: rate(totalActualSpend, totalBudgetCeiling),
      overrideCount,
      registrationRate: rate(approvedRegistrations, totalRegistrations),
      attendanceRate: totalSessions === 0 ? 0 : rate(presentResults, totalSessions * 25),
      noticeReadRate: rate(readNotifications, totalNotifications),
      ticketRevenue: Number(ticketResult._sum.totalAmount ?? 0),
      ticketSalesCount: ticketResult._count.id,
    };
  }

  async getOpsSnapshot(seasonId: number, year: number, month: number): Promise<OpsSnapshotData> {
    const existing = await this.repo.findOpsSnapshot(seasonId, year, month);
    if (existing?.snapshotData) return existing.snapshotData as unknown as OpsSnapshotData;
    return this.computeOpsKpi(seasonId, year, month);
  }

  async getAnnualOpsReport(seasonId: number) {
    const snapshots = await this.repo.findOpsSnapshotsBySeason(seasonId);
    return snapshots.map((s) => ({
      year: s.year,
      month: s.month,
      data: s.snapshotData as unknown as OpsSnapshotData,
    }));
  }

  async computeBudgetSnapshot(seasonId: number, year: number, month: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const [plans, actualsByCategory, expenseCategories] = await Promise.all([
      this.prisma.budgetCategoryPlan.findMany({
        where: { financialReport: { seasonId } },
        select: { categoryId: true, mandatoryMinimum: true, knapsackAllocated: true },
      }),
      this.prisma.operatingExpense.groupBy({
        by: ["categoryId"],
        where: { seasonId, date: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      this.prisma.expenseCategory.findMany({ select: { id: true, code: true } }),
    ]);

    const categoryCode = new Map(expenseCategories.map((c) => [c.id, c.code]));
    const actualsMap = new Map(
      actualsByCategory.map((r) => [r.categoryId, r._sum?.amount ?? 0])
    );

    const snapshotData: Record<string, { budget: number; actual: number }> = {};
    let totalBudget = 0;
    let totalActual = 0;

    for (const plan of plans) {
      const code = categoryCode.get(plan.categoryId);
      if (!code) continue;
      const budget = plan.mandatoryMinimum + (plan.knapsackAllocated ?? 0);
      const actual = actualsMap.get(plan.categoryId) ?? 0;
      snapshotData[code] = { budget, actual };
      totalBudget += budget;
      totalActual += actual;
    }

    return { snapshotData, totalBudget, totalActual };
  }

  async getBudgetSnapshot(seasonId: number, year: number, month: number) {
    const existing = await this.repo.findBudgetSnapshot(seasonId, year, month);
    if (existing) return existing;
    const { snapshotData, totalBudget, totalActual } = await this.computeBudgetSnapshot(seasonId, year, month);
    return { snapshotData, totalBudget, totalActual };
  }

  async getAnnualBudgetReport(seasonId: number) {
    return this.repo.findBudgetSnapshotsBySeason(seasonId);
  }

  async drillNoticeUnread(year: number, month: number): Promise<NoticeUnreadDrillRow[]> {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const groups = await this.prisma.notification.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: start, lt: end }, readAt: null },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });

    if (groups.length === 0) return [];

    const userIds = groups.map((g) => g.userId);
    const [users, notices] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, nickname: true },
      }),
      this.prisma.notification.findMany({
        where: { userId: { in: userIds }, createdAt: { gte: start, lt: end }, readAt: null },
        select: { userId: true, title: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u.nickname]));
    const noticesByUser = new Map<string, string[]>();
    for (const n of notices) {
      const titles = noticesByUser.get(n.userId) ?? [];
      titles.push(n.title);
      noticesByUser.set(n.userId, titles);
    }

    return groups.map((g) => ({
      userId: g.userId,
      name: userMap.get(g.userId) ?? "",
      unreadCount: g._count.id,
      unreadTitles: (noticesByUser.get(g.userId) ?? []).slice(0, 5),
    }));
  }

  async drillAttendance(year: number, month: number): Promise<AttendanceDrillRow[]> {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const sessions = await this.prisma.trainingSession.findMany({
      where: { date: { gte: start, lt: end }, isApproved: true },
      select: { id: true },
    });

    if (sessions.length === 0) return [];

    const sessionIds = sessions.map((s) => s.id);
    const results = await this.prisma.trainingResult.findMany({
      where: { sessionId: { in: sessionIds } },
      select: {
        playerId: true,
        attendance: true,
        player: { select: { playerName: true, position: true, team: { select: { id: true } } } },
      },
    });

    const aggregates = new Map<
      string,
      { playerName: string; position: string | null; teamId: number | null; present: number; lateUnauth: number; absentUnauth: number; authorizedAbsence: number }
    >();

    for (const r of results) {
      if (!aggregates.has(r.playerId)) {
        aggregates.set(r.playerId, {
          playerName: r.player.playerName,
          position: r.player.position,
          teamId: r.player.team?.id ?? null,
          present: 0,
          lateUnauth: 0,
          absentUnauth: 0,
          authorizedAbsence: 0,
        });
      }
      const agg = aggregates.get(r.playerId)!;
      switch (r.attendance) {
        case "PRESENT":
          agg.present++;
          break;
        case "LATE_UNAUTHORIZED":
          agg.lateUnauth++;
          break;
        case "ABSENT_UNAUTHORIZED":
          agg.absentUnauth++;
          break;
        case "ABSENT_AUTHORIZED":
          agg.authorizedAbsence++;
          break;
      }
    }

    const rows: AttendanceDrillRow[] = [];
    for (const [playerId, agg] of aggregates) {
      const effectiveAbsences = agg.absentUnauth + Math.floor(agg.lateUnauth / 3);
      rows.push({ playerId, ...agg, effectiveAbsences });
    }

    rows.sort((a, b) => b.effectiveAbsences - a.effectiveAbsences);
    return rows;
  }

  async getAttendanceCorrectionLog(year: number, month: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    return this.prisma.auditLog.findMany({
      where: {
        action: { in: ["ATTENDANCE_CORRECTED", "TRAINING_RESULT_UPDATED"] },
        createdAt: { gte: start, lt: end },
      },
      include: { actor: { select: { id: true, nickname: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async getSalaryDistributionDrilldown(seasonId: number) {
    const contracts = await this.prisma.contract.findMany({
      where: { status: "ACTIVE" },
      select: {
        salary: true,
        player: { select: { id: true, playerName: true, position: true } },
      },
      orderBy: { salary: "desc" },
    });
    const brackets = [0, 100_000_000, 300_000_000, 500_000_000, 1_000_000_000];
    const distribution = brackets.map((min, i) => {
      const max = brackets[i + 1] ?? Infinity;
      const inBracket = contracts.filter((c) => c.salary >= min && c.salary < max);
      return {
        label: max === Infinity ? `${(min / 1e8).toFixed(0)}억+` : `${(min / 1e8).toFixed(0)}-${(max / 1e8).toFixed(0)}억`,
        count: inBracket.length,
        players: inBracket.map((c) => ({ id: c.player.id, name: c.player.playerName, position: c.player.position, salary: c.salary })),
      };
    });
    return distribution;
  }

  async getSessionsWithUnregisteredAttendance(seasonId: number, year: number, month: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    const sessions = await this.prisma.trainingSession.findMany({
      where: { seasonId, date: { gte: start, lt: end }, isApproved: true },
      include: {
        _count: { select: { results: true } },
      },
    });
    const totalPlayers = await this.prisma.player.count({
      where: { status: "ACTIVE", team: { type: { not: "YOUTH" } } },
    });
    return sessions.map((s) => ({
      sessionId: s.id,
      date: s.date,
      registeredCount: s._count.results,
      totalPlayers,
      unregisteredCount: Math.max(0, totalPlayers - s._count.results),
    }));
  }

  async getBudgetExecutionByCategory(seasonId: number, year: number, month: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    const [plans, actuals, expenseCategories] = await Promise.all([
      this.prisma.budgetCategoryPlan.findMany({
        where: { financialReport: { seasonId } },
        select: { categoryId: true, mandatoryMinimum: true, knapsackAllocated: true },
      }),
      this.prisma.operatingExpense.groupBy({
        by: ["categoryId"],
        where: { seasonId, date: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      this.prisma.expenseCategory.findMany({ select: { id: true, code: true } }),
    ]);
    const categoryCode = new Map(expenseCategories.map((c) => [c.id, c.code]));
    const actualsMap = new Map(actuals.map((a) => [a.categoryId, a._sum?.amount ?? 0]));
    return plans.flatMap((p) => {
      const code = categoryCode.get(p.categoryId);
      if (!code) return [];
      const budget = p.mandatoryMinimum + (p.knapsackAllocated ?? 0);
      const actual = actualsMap.get(p.categoryId) ?? 0;
      return [{ category: code, budget, actual, executionRate: budget === 0 ? 0 : Math.round((actual / budget) * 1000) / 10 }];
    });
  }

  async getPartnerKpi(seasonId: number) {
    const partners = await this.prisma.partner.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        _count: { select: { contracts: true } },
      },
    });
    const activeContracts = await this.prisma.partnerContract.findMany({
      where: { status: "ACTIVE" },
      select: { partnerId: true, sponsorshipFee: true },
    });
    const contractsByPartner = new Map<number, number>();
    for (const c of activeContracts) {
      contractsByPartner.set(c.partnerId, (contractsByPartner.get(c.partnerId) ?? 0) + Number(c.sponsorshipFee ?? 0));
    }
    return partners.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      totalContracts: p._count.contracts,
      activeContractValue: contractsByPartner.get(p.id) ?? 0,
    }));
  }

  async getPenaltyStatus(teamId: number): Promise<PenaltyStatusRow[]> {
    const sessions = await this.prisma.trainingSession.findMany({
      where: { isApproved: true },
      select: { id: true },
    });
    if (sessions.length === 0) return [];

    const sessionIds = sessions.map((s) => s.id);
    const results = await this.prisma.trainingResult.findMany({
      where: { sessionId: { in: sessionIds } },
      select: {
        playerId: true,
        attendance: true,
        player: {
          select: {
            playerName: true,
            team: { select: { id: true } },
          },
        },
      },
    });

    const agg = new Map<string, { playerName: string; absentUnauth: number; lateUnauth: number }>();
    for (const r of results) {
      if (r.player.team?.id !== teamId) continue;
      if (!agg.has(r.playerId)) {
        agg.set(r.playerId, { playerName: r.player.playerName, absentUnauth: 0, lateUnauth: 0 });
      }
      const a = agg.get(r.playerId)!;
      if (r.attendance === "ABSENT_UNAUTHORIZED") a.absentUnauth++;
      else if (r.attendance === "LATE_UNAUTHORIZED") a.lateUnauth++;
    }

    const rows: PenaltyStatusRow[] = [];
    for (const [playerId, a] of agg) {
      const effectiveAbsences = a.absentUnauth + Math.floor(a.lateUnauth / 3);
      if (effectiveAbsences === 0) continue;
      const status: PenaltyStatusRow["status"] =
        effectiveAbsences % 3 === 0 ? "TRIGGERED" :
        effectiveAbsences % 3 === 2 ? "WARNING" : "NORMAL";
      rows.push({ playerId, playerName: a.playerName, effectiveAbsences, status });
    }

    rows.sort((a, b) => b.effectiveAbsences - a.effectiveAbsences);
    return rows;
  }

  async getSponsorshipVsBudget(seasonId: number) {
    const season = await this.prisma.season.findUnique({
      where: { id: seasonId },
      select: { startDate: true, endDate: true },
    });
    if (!season) throw new AppError(404, "SEASON_NOT_FOUND");

    const [report, sponsorshipTotal] = await Promise.all([
      (this.prisma.financialReport as any).findFirst({
        where: { seasonId },
        select: {
          totalRevenue: true,
          plannedRevenueTicket: true,
          plannedRevenueSponsorship: true,
          plannedRevenueBroadcast: true,
          plannedRevenueMerchandise: true,
          plannedRevenueSubsidy: true,
          plannedRevenueParentCompany: true,
          plannedRevenueAcademyFee: true,
          plannedRevenueOther: true,
        },
      }),
      // Scope to season window — mirrors getSeasonRevenueActuals (season-actuals.ts).
      // Without this, the coverage rate mixes PAID payments from every season since
      // launch and the number is meaningless once more than one season exists.
      this.prisma.sponsorshipPayment.aggregate({
        where: {
          status: "PAID",
          paidAt: { gte: season.startDate, lte: season.endDate },
        },
        _sum: { amount: true },
      }),
    ]);
    const collected = Number(sponsorshipTotal._sum.amount ?? 0);
    const plannedRevenue = report?.totalRevenue ?? 0;
    return {
      plannedRevenue,
      revenueBreakdown: report
        ? {
            ticket: report.plannedRevenueTicket ?? 0,
            sponsorship: report.plannedRevenueSponsorship ?? 0,
            broadcast: report.plannedRevenueBroadcast ?? 0,
            merchandise: report.plannedRevenueMerchandise ?? 0,
            subsidy: report.plannedRevenueSubsidy ?? 0,
            parentCompany: report.plannedRevenueParentCompany ?? 0,
            academyFee: (report as any).plannedRevenueAcademyFee ?? 0,
            other: report.plannedRevenueOther ?? 0,
          }
        : null,
      sponsorshipCollected: collected,
      coverageRate: plannedRevenue
        ? Math.round((collected / plannedRevenue) * 1000) / 10
        : 0,
    };
  }
}
