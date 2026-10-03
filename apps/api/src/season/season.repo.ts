import { PrismaClient, SeasonStatus } from "../generated/client";
import type { WageCapType } from "../generated/enums";
import { getSeasonRevenueActuals } from "../lib/season-actuals";
import { getSeasonPlayerSalary, getSeasonStaffSalary } from "../lib/season-salary";
import { computeSigningBonusForSeason } from "../lib/signing-bonus";

export class SeasonRepository {
  constructor(private prisma: PrismaClient) {}

  async create(data: { name: string; startDate: Date; endDate: Date; leagueId?: number }) {
    return await this.prisma.season.create({ data, include: { league: true } });
  }

  async findById(id: number) {
    return await this.prisma.season.findUnique({
      where: { id },
      include: { _count: { select: { matches: true, trainingSessions: true } }, league: true },
    });
  }

  async findAll(status?: SeasonStatus) {
    return await this.prisma.season.findMany({
      ...(status !== undefined && { where: { status } }),
      orderBy: { startDate: "desc" },
      include: { league: true },
    });
  }

  async findActive() {
    return await this.prisma.season.findFirst({
      where: { status: SeasonStatus.ACTIVE },
    });
  }

  async updateStatus(id: number, status: SeasonStatus) {
    return await this.prisma.season.update({
      where: { id },
      data: { status },
    });
  }

  async updateWageCap(id: number, wageCapType: string | null, wageCapValue: number | null) {
    return await this.prisma.season.update({
      where: { id },
      data: { wageCapType: wageCapType as WageCapType | null, wageCapValue },
    });
  }

  async findActiveWithKPI() {
    const season = await this.prisma.season.findFirst({
      where: { status: SeasonStatus.ACTIVE },
      include: { financialReport: { select: { totalRevenue: true } } },
    });
    if (!season) return null;

    const contracts = await this.prisma.contract.findMany({
      where: {
        status: "ACTIVE",
        startDate: { lte: season.endDate },
        endDate: { gte: season.startDate },
      },
      select: { salary: true, signingBonus: true, startDate: true, endDate: true },
    });

    const totalPayroll = contracts.reduce((sum, c) => {
      const bonus = computeSigningBonusForSeason(c, season.startDate, season.endDate);
      return sum + c.salary + bonus;
    }, 0);
    const totalRevenue = season.financialReport?.totalRevenue ?? null;

    let cap: number | null = null;
    if (season.wageCapType === "FIXED" && season.wageCapValue != null) {
      cap = season.wageCapValue;
    } else if (season.wageCapType === "RATIO" && season.wageCapValue != null && totalRevenue != null) {
      cap = Math.round(totalRevenue * season.wageCapValue);
    }

    // Available-budget breakdown: revenue + carryover - player salary - staff salary.
    // Aggregates run in parallel; all sources are read-only. `revenueActual` sums
    // the live-computed fields from getSeasonRevenueActuals (Broadcast/Subsidy/
    // ParentCompany are 0 from that helper — those manual-entry fields are
    // covered by FinancialReport.plannedRevenue* in planned mode).
    const [
      currentRevenueActuals,
      playerSalary,
      staffPlanned,
      staffActual,
      fr,
    ] = await Promise.all([
      getSeasonRevenueActuals(season.id),
      getSeasonPlayerSalary(this.prisma, season.id),
      getSeasonStaffSalary(this.prisma, season.id, "planned"),
      getSeasonStaffSalary(this.prisma, season.id, "actual"),
      this.prisma.financialReport.findUnique({
        where: { seasonId: season.id },
        select: {
          carryOverFromPrev: true,
          carryOverOverriddenById: true,
          carryOverOverriddenAt: true,
          carryOverOverrideReason: true,
        },
      }),
    ]);

    const revenuePlanned = totalRevenue ?? 0;
    const revenueActual =
      currentRevenueActuals.plannedRevenueTicket +
      currentRevenueActuals.plannedRevenueSponsorship +
      currentRevenueActuals.plannedRevenueBroadcast +
      currentRevenueActuals.plannedRevenueMerchandise +
      currentRevenueActuals.plannedRevenueSubsidy +
      currentRevenueActuals.plannedRevenueParentCompany +
      currentRevenueActuals.plannedRevenueAcademyFee +
      currentRevenueActuals.plannedRevenueOther;
    const carry = Number(fr?.carryOverFromPrev ?? 0);
    const revenueActualRounded = Math.round(revenueActual);

    return {
      // Existing fields (backwards-compat — must not change shape).
      wageCapType: season.wageCapType,
      wageCapValue: season.wageCapValue,
      totalRevenue,
      cap,
      totalPayroll,
      percentUsed: cap != null ? Math.round((totalPayroll / cap) * 1000) / 10 : null,
      remaining: cap != null ? cap - totalPayroll : null,
      // New available-budget breakdown (Planned / Actual).
      revenue: { planned: revenuePlanned, actual: revenueActualRounded },
      carryOverFromPrev: {
        amount: carry,
        isAutoCalculated: !fr?.carryOverOverriddenById,
        overriddenAt: fr?.carryOverOverriddenAt ?? null,
        overriddenById: fr?.carryOverOverriddenById ?? null,
        overrideReason: fr?.carryOverOverrideReason ?? null,
      },
      // Player salary has no separate `actual` source yet — mirror planned.
      playerSalary: { planned: playerSalary, actual: playerSalary },
      staffSalary: { planned: staffPlanned, actual: staffActual },
      availableBudget: {
        planned: revenuePlanned + carry - playerSalary - staffPlanned,
        actual: revenueActualRounded + carry - playerSalary - staffActual,
      },
    };
  }
}
