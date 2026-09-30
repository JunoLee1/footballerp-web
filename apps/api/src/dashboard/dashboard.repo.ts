import { PrismaClient } from "../generated/client";
import { CoachingRole, Position, SessionType } from "../generated/enums";

const NOW = () => new Date();
const IN_30_DAYS = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const START_OF_MONTH = () => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};
const START_OF_WEEK = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // 월요일 기준
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const DEFENSIVE_POSITIONS: Position[] = [
  Position.CENTER_BACK,
  Position.LEFT_WING_BACK,
  Position.RIGHT_WING_BACK,
  Position.LEFT_FULL_BACK,
  Position.RIGHT_FULL_BACK,
];

const ATTACKING_POSITIONS: Position[] = [
  Position.STRIKER,
  Position.SHADOW_STRIKER,
  Position.WINGER,
  Position.CENTRAL_ATTACK_MIDFIELDER,
  Position.RIGHT_ATTACK_MIDFIELDER,
  Position.LEFT_ATTACK_MIDFIELDER,
];

export class DashboardRepository {
  constructor(private prisma: PrismaClient) {}

  async getAdminStats(teamType?: "FIRST_TEAM" | "YOUTH") {
    const teamFilter = teamType ? { team: { type: teamType } } : {};
    const [activePlayerCount, expiringContractCount, injuredPlayerCount, lowStockEquipmentCount] =
      await Promise.all([
        this.prisma.player.count({ where: { status: "ACTIVE", ...teamFilter } }),
        this.prisma.contract.count({
          where: { status: "ACTIVE", endDate: { lte: IN_30_DAYS(), gte: NOW() } },
        }),
        this.prisma.injury.count({
          where: { status: { notIn: ["RETURNED"] }, ...(teamType && { player: { team: { type: teamType } } }) },
        }),
        this.prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*) as count FROM "EquipmentItem"
          WHERE "trackedIndividually" = false
            AND "lowStockThreshold" IS NOT NULL
            AND "quantity" IS NOT NULL
            AND "quantity" <= "lowStockThreshold"
        `.then((r) => Number(r[0]?.count ?? 0)),
      ]);
    return { activePlayerCount, expiringContractCount, injuredPlayerCount, lowStockEquipmentCount };
  }

  async getGmStats() {
    const [expiringContractCount, injuredPlayerCount, activeTransferCount] = await Promise.all([
      this.prisma.contract.count({
        where: { status: "ACTIVE", endDate: { lte: IN_30_DAYS(), gte: NOW() } },
      }),
      this.prisma.injury.count({ where: { status: { notIn: ["RETURNED"] } } }),
      this.prisma.transfer.count({
        where: {
          type: { in: ["LOAN_OUT", "LOAN_IN"] },
          startDate: { lte: NOW() },
          OR: [{ endDate: null }, { endDate: { gte: NOW() } }],
        },
      }),
    ]);
    return { expiringContractCount, injuredPlayerCount, activeTransferCount };
  }

  async getTdStats() {
    const [activeTransferCount, prospectCount, injuredPlayerCount] = await Promise.all([
      this.prisma.transfer.count({
        where: {
          type: { in: ["LOAN_OUT", "LOAN_IN"] },
          startDate: { lte: NOW() },
          OR: [{ endDate: null }, { endDate: { gte: NOW() } }],
        },
      }),
      this.prisma.prospect.count({ where: { status: "ACTIVE" } }),
      this.prisma.injury.count({ where: { status: { notIn: ["RETURNED"] } } }),
    ]);
    return { activeTransferCount, prospectCount, injuredPlayerCount };
  }

  async getContractManagerStats() {
    const [expiringContractCount, totalActiveContractCount] = await Promise.all([
      this.prisma.contract.count({
        where: { status: "ACTIVE", endDate: { lte: IN_30_DAYS(), gte: NOW() } },
      }),
      this.prisma.contract.count({ where: { status: "ACTIVE" } }),
    ]);
    return { expiringContractCount, totalActiveContractCount };
  }

  async getScoutStats() {
    const [prospectCount, thisMonthProspectCount] = await Promise.all([
      this.prisma.prospect.count({ where: { status: "ACTIVE" } }),
      this.prisma.prospect.count({
        where: { status: "ACTIVE", createdAt: { gte: START_OF_MONTH() } },
      }),
    ]);
    return { prospectCount, thisMonthProspectCount };
  }

  async getEquipmentManagerStats() {
    const [lowStockEquipmentCount, totalEquipmentItemCount] = await Promise.all([
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM "EquipmentItem"
        WHERE "trackedIndividually" = false
          AND "lowStockThreshold" IS NOT NULL
          AND "quantity" IS NOT NULL
          AND "quantity" <= "lowStockThreshold"
      `.then((r) => Number(r[0]?.count ?? 0)),
      this.prisma.equipmentItem.count(),
    ]);
    return { lowStockEquipmentCount, totalEquipmentItemCount };
  }

  async getTacticalAnalystStats(userId: string) {
    const [myDraftAnalysisCount, thisMonthMatchCount] = await Promise.all([
      this.prisma.tacticalAnalysis.count({
        where: { createdById: userId, status: "DRAFT" },
      }),
      this.prisma.match.count({ where: { date: { gte: START_OF_MONTH() } } }),
    ]);
    return { myDraftAnalysisCount, thisMonthMatchCount };
  }

  async getHeadCoachStats() {
    const [injuredPlayerCount, thisMonthSessionCount, attendanceWarningPlayerCount, trainingEvalEntryRate] =
      await Promise.all([
        this.prisma.injury.count({ where: { status: { notIn: ["RETURNED"] } } }),
        this.prisma.trainingSession.count({ where: { date: { gte: START_OF_MONTH() } } }),
        this.prisma.notification.count({
          where: { type: "TRAINING_ATTENDANCE_WARNING", readAt: null },
        }),
        this.getTrainingEvalEntryRate(),
      ]);
    return { injuredPlayerCount, thisMonthSessionCount, attendanceWarningPlayerCount, trainingEvalEntryRate };
  }

  private async getTrainingEvalEntryRate(): Promise<number> {
    const sessionFilter = { isApproved: true, cancelledAt: null, date: { gte: START_OF_MONTH() } };
    const absentFilter = { notIn: ["ABSENT_AUTHORIZED" as const, "ABSENT_UNAUTHORIZED" as const] };
    const [scored, total] = await Promise.all([
      this.prisma.trainingResult.count({
        where: {
          attendance: absentFilter,
          performanceScore: { not: null },
          session: sessionFilter,
        },
      }),
      this.prisma.trainingResult.count({
        where: {
          attendance: absentFilter,
          session: sessionFilter,
        },
      }),
    ]);
    return total === 0 ? 0 : Math.round((scored / total) * 100);
  }

  async getSpecialistCoachStats(coachingRole: CoachingRole, userId: string) {
    const positionFilter: Position[] | undefined =
      coachingRole === CoachingRole.DEFENSIVE_COACH
        ? DEFENSIVE_POSITIONS
        : coachingRole === CoachingRole.ATTACKING_COACH
          ? ATTACKING_POSITIONS
          : coachingRole === CoachingRole.GOALKEEPER_COACH
            ? [Position.GOALKEEPER]
            : undefined;

    const sessionTypeFilter: SessionType | undefined =
      coachingRole === CoachingRole.SET_PIECE_COACH
        ? SessionType.SET_PIECE
        : coachingRole === CoachingRole.GOALKEEPER_COACH
          ? SessionType.GOALKEEPER
          : undefined;

    const [assignedPlayerCount, myThisMonthSessionCount] = await Promise.all([
      positionFilter
        ? this.prisma.player.count({
            where: { status: "ACTIVE", position: { in: positionFilter } },
          })
        : this.prisma.player.count({ where: { status: "ACTIVE" } }),
      this.prisma.trainingSession.count({
        where: {
          createdById: userId,
          date: { gte: START_OF_MONTH() },
          ...(sessionTypeFilter ? { sessionType: sessionTypeFilter } : {}),
        },
      }),
    ]);
    return { assignedPlayerCount, myThisMonthSessionCount };
  }

  async getPhysicalCoachStats(userId: string) {
    const [assignedPlayerCount, myThisMonthSessionCount] = await Promise.all([
      this.prisma.player.count({ where: { status: "ACTIVE" } }),
      this.prisma.trainingSession.count({
        where: {
          createdById: userId,
          sessionType: "PHYSICAL",
          date: { gte: START_OF_MONTH() },
        },
      }),
    ]);
    return { assignedPlayerCount, myThisMonthSessionCount };
  }

  async getMedicalStats(userId: string) {
    const [myActiveInjuryCaseCount, thisMonthReturnReadyCount] = await Promise.all([
      this.prisma.injury.count({
        where: { medicalStaffId: userId, status: { notIn: ["RETURNED"] } },
      }),
      this.prisma.injury.count({
        where: {
          medicalStaffId: userId,
          status: "READY_TO_RETURN",
          occurredAt: { gte: START_OF_MONTH() },
        },
      }),
    ]);
    return { myActiveInjuryCaseCount, thisMonthReturnReadyCount };
  }

  async getMedicalDirectorStats(userId: string) {
    const [myActiveInjuryCaseCount, thisMonthReturnReadyCount, totalInjuredPlayerCount] =
      await Promise.all([
        this.prisma.injury.count({
          where: { medicalStaffId: userId, status: { notIn: ["RETURNED"] } },
        }),
        this.prisma.injury.count({
          where: {
            medicalStaffId: userId,
            status: "READY_TO_RETURN",
            occurredAt: { gte: START_OF_MONTH() },
          },
        }),
        this.prisma.injury.count({
          where: { status: { notIn: ["RETURNED"] } },
        }),
      ]);
    return { myActiveInjuryCaseCount, thisMonthReturnReadyCount, totalInjuredPlayerCount };
  }

  async getPlayerStats(userId: string) {
    const player = await this.prisma.player.findUnique({ where: { userId } });
    if (!player) return { thisSeasonMatchCount: 0, thisMonthAttendanceRate: 0 };

    const [thisSeasonMatchCount, attendedSessions, totalSessions] = await Promise.all([
      this.prisma.playerMatchStats.count({ where: { playerId: player.id } }),
      this.prisma.trainingParticipant.count({
        where: { playerId: player.id, session: { date: { gte: START_OF_MONTH() } } },
      }),
      this.prisma.trainingSession.count({ where: { date: { gte: START_OF_MONTH() } } }),
    ]);

    const thisMonthAttendanceRate =
      totalSessions > 0 ? Math.round((attendedSessions / totalSessions) * 100) : 0;

    return { thisSeasonMatchCount, thisMonthAttendanceRate };
  }

  async getAgentStats(userId: string) {
    const [managedPlayerCount, injuredManagedPlayerCount, expiringManagedContractCount] =
      await Promise.all([
        this.prisma.player.count({ where: { agentId: userId, status: "ACTIVE" } }),
        this.prisma.injury.count({
          where: { status: { notIn: ["RETURNED"] }, player: { agentId: userId } },
        }),
        this.prisma.contract.count({
          where: {
            status: "ACTIVE",
            endDate: { lte: IN_30_DAYS(), gte: NOW() },
            player: { agentId: userId },
          },
        }),
      ]);
    return { managedPlayerCount, injuredManagedPlayerCount, expiringManagedContractCount };
  }

  async getYouthDevelopmentStats() {
    const rows = await this.prisma.$queryRaw<
      Array<{
        playerId: string;
        playerName: string;
        teamId: number;
        teamName: string;
        slotKey: string;
        totalMinutes: number;
      }>
    >`
      SELECT
        p.id                      AS "playerId",
        p."playerName"            AS "playerName",
        t.id                      AS "teamId",
        t.name                    AS "teamName",
        ls."slotKey"              AS "slotKey",
        COALESCE(SUM(pms."minutesPlayed"), 0)::int AS "totalMinutes"
      FROM "Player" p
      JOIN "Team" t ON t.id = p."teamId"
      JOIN "MatchLineup" ml ON ml."matchId" IN (
        SELECT id FROM "Match" WHERE "teamId" = t.id
      )
      JOIN "LineupSlot" ls ON ls."lineupId" = ml.id AND ls."playerId" = p.id
      LEFT JOIN "PlayerMatchStats" pms ON pms."matchId" = ml."matchId" AND pms."playerId" = p.id
      WHERE t.type = 'YOUTH'
        AND pms."minutesPlayed" IS NOT NULL
        AND pms."minutesPlayed" > 0
      GROUP BY p.id, p."playerName", t.id, t.name, ls."slotKey"
      ORDER BY t.id, p.id
    `;

    const byPlayer = new Map<
      string,
      { playerId: string; playerName: string; teamId: number; teamName: string; slots: Map<string, number>; totalMinutes: number }
    >();

    for (const row of rows) {
      if (!byPlayer.has(row.playerId)) {
        byPlayer.set(row.playerId, {
          playerId: row.playerId, playerName: row.playerName,
          teamId: row.teamId, teamName: row.teamName,
          slots: new Map(), totalMinutes: 0,
        });
      }
      const entry = byPlayer.get(row.playerId)!;
      entry.slots.set(row.slotKey, row.totalMinutes);
      entry.totalMinutes += row.totalMinutes;
    }

    const players = Array.from(byPlayer.values()).map((entry) => {
      const slotDistribution: Record<string, number> = {};
      let maxPct = 0;
      let biasedSlot: string | null = null;
      for (const [slot, minutes] of entry.slots.entries()) {
        const pct = entry.totalMinutes > 0 ? minutes / entry.totalMinutes : 0;
        slotDistribution[slot] = Math.round(pct * 100);
        if (pct > maxPct) { maxPct = pct; biasedSlot = slot; }
      }
      return {
        playerId: entry.playerId, playerName: entry.playerName,
        teamId: entry.teamId, teamName: entry.teamName,
        totalMinutes: entry.totalMinutes, slotDistribution,
        biasedSlot, biasedPct: Math.round(maxPct * 100), isBiased: maxPct >= 0.8,
      };
    });

    const byTeam = new Map<number, { teamId: number; teamName: string; players: typeof players }>();
    for (const p of players) {
      if (!byTeam.has(p.teamId)) byTeam.set(p.teamId, { teamId: p.teamId, teamName: p.teamName, players: [] });
      byTeam.get(p.teamId)!.players.push(p);
    }

    return {
      teams: Array.from(byTeam.values()).map((t) => ({
        teamId: t.teamId, teamName: t.teamName,
        playerCount: t.players.length,
        biasedPlayerCount: t.players.filter((p) => p.isBiased).length,
        players: t.players,
      })),
    };
  }

  async getMedicalDashboardStats() {
    const now = NOW();
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const startOfWeek = START_OF_WEEK();

    const [
      currentInjuredPlayers,
      weekNewInjuryCount,
      returningIn7DaysPlayers,
      incompleteDocCount,
      pendingApprovalCount,
      avgRecoveryRaw,
      injuryGroups,
    ] = await Promise.all([
      this.prisma.injury.findMany({
        where: { status: { notIn: ["RETURNED"] } },
        select: { playerId: true },
        distinct: ["playerId"],
      }),
      this.prisma.injury.count({
        where: { occurredAt: { gte: startOfWeek } },
      }),
      this.prisma.injury.findMany({
        where: {
          status: { notIn: ["RETURNED"] },
          expectedReturnDate: { gte: now, lte: in7Days },
        },
        select: { playerId: true },
        distinct: ["playerId"],
      }),
      this.prisma.medicalExpense.count({
        where: { OR: [{ fileUrl: null }, { status: "DRAFT" }] },
      }),
      this.prisma.medicalExpense.count({
        where: { status: { in: ["SUBMITTED", "LEADER_APPROVED"] } },
      }),
      this.prisma.$queryRaw<{ avg_days: number | null }[]>`
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM ("expectedReturnDate" - "occurredAt")) / 86400))::int AS avg_days
        FROM "Injury"
        WHERE status = 'RETURNED'
          AND "expectedReturnDate" IS NOT NULL
      `,
      this.prisma.injury.groupBy({
        by: ["playerId"],
        _count: { id: true },
      }),
    ]);

    const playerIds = injuryGroups.map((g) => g.playerId);
    const players = await this.prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, position: true },
    });
    const posMap = new Map(players.map((p) => [p.id, p.position]));

    const GK_POSITIONS = ["GOALKEEPER"];
    const DF_POSITIONS = ["CENTER_BACK", "LEFT_WING_BACK", "RIGHT_WING_BACK", "LEFT_FULL_BACK", "RIGHT_FULL_BACK"];
    const MF_POSITIONS = ["CENTRAL_ATTACK_MIDFIELDER", "RIGHT_ATTACK_MIDFIELDER", "LEFT_ATTACK_MIDFIELDER", "CENTRAL_DEFENSIVE_MIDFIELDER", "LEFT_DEFENSIVE_MIDFIELDER", "RIGHT_DEFENSIVE_MIDFIELDER"];
    const FW_POSITIONS = ["STRIKER", "SHADOW_STRIKER", "WINGER"];

    const injuriesByPosition = { GK: 0, DF: 0, MF: 0, FW: 0 };
    for (const g of injuryGroups) {
      const pos = posMap.get(g.playerId);
      if (!pos) continue;
      if (GK_POSITIONS.includes(pos)) injuriesByPosition.GK += g._count.id;
      else if (DF_POSITIONS.includes(pos)) injuriesByPosition.DF += g._count.id;
      else if (MF_POSITIONS.includes(pos)) injuriesByPosition.MF += g._count.id;
      else if (FW_POSITIONS.includes(pos)) injuriesByPosition.FW += g._count.id;
    }

    return {
      currentInjuredCount: currentInjuredPlayers.length,
      weekNewInjuryCount,
      returningIn7DaysCount: returningIn7DaysPlayers.length,
      reinjuryRiskCount: injuryGroups.filter((g) => g._count.id >= 2).length,
      incompleteDocCount,
      pendingApprovalCount,
      avgRecoveryDays: avgRecoveryRaw[0]?.avg_days ?? null,
      injuriesByPosition,
    };
  }

  async getAcademyFinanceStats(year: number, month: number) {
    const rows = await this.prisma.academyFee.groupBy({
      by: ["status"],
      where: { year, month },
      _count: { id: true },
      _sum: { amount: true },
    });
    const total = rows.reduce((s, r) => s + (r._count.id ?? 0), 0);
    const paid = rows.find(r => r.status === "PAID")?._count.id ?? 0;
    const overdue = rows
      .filter(r => ["OVERDUE", "LOCKED"].includes(r.status as string))
      .reduce((s, r) => s + (r._count.id ?? 0), 0);
    const locked = rows.find(r => r.status === "LOCKED")?._count.id ?? 0;
    const totalRevenue = rows.find(r => r.status === "PAID")?._sum.amount ?? 0;
    return {
      monthlyCollectionRate: total > 0 ? Math.round((paid / total) * 100) : 0,
      totalRevenue,
      overdueCount: overdue,
      lockedPlayerCount: locked,
    };
  }

  async getHrManagerStats() {
    const [totalStaffCount, openJobPostingCount, activeApplicationCount] = await Promise.all([
      this.prisma.user.count({ where: { isDeleted: false, role: { not: "GUARDIAN" } } }),
      this.prisma.jobPosting.count({ where: { status: "OPEN" } }),
      this.prisma.jobApplication.count({
        where: { status: { notIn: ["REJECTED", "ONBOARDED"] } },
      }),
    ]);
    return { totalStaffCount, openJobPostingCount, activeApplicationCount };
  }

  async getFinanceManagerStats() {
    const [thisMonthExpense, pendingOperatingExpenseCount] = await Promise.all([
      this.prisma.operatingExpense.aggregate({
        _sum: { amount: true },
        where: {
          date: { gte: START_OF_MONTH() },
          status: { in: ["APPROVED", "PAID"] },
          deletedAt: null,
        },
      }).then((r) => r._sum.amount ?? 0),
      this.prisma.operatingExpense.count({
        where: {
          status: "PENDING",
          deletedAt: null,
        },
      }),
    ]);
    return { thisMonthExpense, pendingOperatingExpenseCount };
  }

  async getAssetManagerStats() {
    const [lowStockEquipmentCount, totalEquipmentItemCount, activeEquipmentLoanCount] =
      await Promise.all([
        this.prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*) as count FROM "EquipmentItem"
          WHERE "trackedIndividually" = false
            AND "lowStockThreshold" IS NOT NULL
            AND "quantity" IS NOT NULL
            AND "quantity" <= "lowStockThreshold"
        `.then((r) => Number(r[0]?.count ?? 0)),
        this.prisma.equipmentItem.count(),
        this.prisma.equipmentLoan.count({ where: { returnedAt: null } }),
      ]);
    return { lowStockEquipmentCount, totalEquipmentItemCount, activeEquipmentLoanCount };
  }

  async findTodayTrainingSession(todayStart: Date, todayEnd: Date) {
    return this.prisma.trainingSession.findFirst({
      where: { date: { gte: todayStart, lt: todayEnd }, isApproved: true },
      include: {
        results: {
          where: {
            attendance: {
              in: ["ABSENT_UNAUTHORIZED", "LATE_UNAUTHORIZED", "ABSENT_AUTHORIZED"],
            },
          },
          include: {
            player: { select: { id: true, playerName: true, position: true } },
          },
        },
      },
    });
  }

  async findRecentTrainingSession(beforeDate: Date) {
    return this.prisma.trainingSession.findFirst({
      where: { isApproved: true, date: { lt: beforeDate } },
      orderBy: { date: "desc" },
      include: {
        results: {
          where: {
            attendance: {
              in: ["ABSENT_UNAUTHORIZED", "LATE_UNAUTHORIZED", "ABSENT_AUTHORIZED"],
            },
          },
          include: {
            player: { select: { id: true, playerName: true, position: true } },
          },
        },
      },
    });
  }

  async findActiveInjuries() {
    return this.prisma.injury.findMany({
      where: { status: { notIn: ["RETURNED"] } },
      include: {
        player: { select: { id: true, playerName: true, position: true } },
      },
      orderBy: { expectedReturnDate: "asc" },
      take: 10,
    });
  }

  async findNextMatch(from: Date) {
    return this.prisma.match.findFirst({
      where: { date: { gte: from } },
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        homeTeamName: true,
        awayTeamName: true,
        venue: true,
      },
    });
  }

  async getFacilityStats() {
    const [openMaintenanceCount, lowStockInventoryCount] = await Promise.all([
      this.prisma.maintenanceRequest.count({ where: { status: { in: ["OPEN", "PENDING_APPROVAL"] } } }),
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM "FacilityInventoryItem"
        WHERE "quantity" <= "minThreshold"
      `.then((r) => Number(r[0]?.count ?? 0)),
    ]);
    return { openMaintenanceCount, lowStockInventoryCount };
  }
}
