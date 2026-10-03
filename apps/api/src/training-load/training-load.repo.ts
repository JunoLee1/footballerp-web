import { PrismaClient } from "../generated/client";
import { UpsertTrainingLoadDto, TrainingLoadQuery } from "./dto/training-load.dto";

export class TrainingLoadRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(query: TrainingLoadQuery) {
    const where: Record<string, unknown> = {};
    if (query.sessionId) where["sessionId"] = query.sessionId;
    if (query.playerId) where["playerId"] = query.playerId;
    return this.prisma.trainingLoad.findMany({
      where,
      include: {
        player: { select: { id: true, playerName: true, position: true } },
        session: { select: { id: true, date: true, sessionType: true } },
      },
      orderBy: { session: { date: "desc" } },
    });
  }

  async upsert(dto: UpsertTrainingLoadDto) {
    // KN10: fetch existing record to preserve previous values for audit trail
    const existing = await this.prisma.trainingLoad.findFirst({
      where: { playerId: dto.playerId, sessionId: dto.sessionId },
      select: { rpe: true, load: true, loadUnit: true, version: true },
    });

    return this.prisma.trainingLoad.upsert({
      where: { playerId_sessionId: { playerId: dto.playerId, sessionId: dto.sessionId } },
      create: {
        playerId: dto.playerId,
        sessionId: dto.sessionId,
        // BH1: no default value for rpe — only set when explicitly provided
        ...(dto.rpe !== undefined && { rpe: dto.rpe }),
        load: dto.load ?? null,
        ...(dto.loadUnit !== undefined && { loadUnit: dto.loadUnit }),
      },
      update: {
        ...(dto.rpe !== undefined && { rpe: dto.rpe }),
        ...(dto.load !== undefined && { load: dto.load }),
        ...(dto.loadUnit !== undefined && { loadUnit: dto.loadUnit }),
        // KN10: preserve previous values for audit trail
        ...(existing && {
          previousRpe: existing.rpe,
          previousLoad: existing.load,
          version: (existing.version ?? 0) + 1,
        }),
      },
    });
  }

  async getWeeklyLoadTotal(playerId: string, weekStart: Date): Promise<number> {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const rows = await this.prisma.trainingLoad.findMany({
      where: {
        playerId,
        load: { not: null },
        session: { date: { gte: weekStart, lt: weekEnd }, cancelledAt: null },
      },
      select: { load: true },
    });
    return rows.reduce((sum, r) => sum + (r.load ?? 0), 0);
  }

  getPlayerName(playerId: string) {
    return this.prisma.player.findUnique({
      where: { id: playerId },
      select: { playerName: true, position: true },
    });
  }

  async getInjuryLoadCorrelation(playerId: string, weeksBeforeInjury = 4) {
    const injuries = await this.prisma.injury.findMany({
      where: { playerId },
      select: { id: true, occurredAt: true, bodyPart: true, cause: true },
      orderBy: { occurredAt: "desc" },
    });
    if (injuries.length === 0) return [];

    const windowMs = weeksBeforeInjury * 7 * 24 * 60 * 60 * 1000;
    const earliest = new Date(Math.min(...injuries.map((i) => i.occurredAt.getTime())) - windowMs);
    const latest = injuries[0]!.occurredAt;

    const allLoads = await this.prisma.trainingLoad.findMany({
      where: { playerId, session: { date: { gte: earliest, lte: latest }, cancelledAt: null } },
      include: { session: { select: { date: true, sessionType: true } } },
      orderBy: { session: { date: "asc" } },
    });

    return injuries.map((injury) => {
      const windowStart = new Date(injury.occurredAt.getTime() - windowMs);
      const loads = allLoads.filter(
        (l) => l.session.date >= windowStart && l.session.date <= injury.occurredAt,
      );
      const totalLoad = loads.reduce((s, l) => s + (l.load ?? 0), 0);
      const avgRpe = loads.length === 0 ? null : Math.round((loads.reduce((s, l) => s + l.rpe, 0) / loads.length) * 10) / 10;
      return { injury, priorPeriodLoad: totalLoad, avgRpe, sessionCount: loads.length };
    });
  }

  async getPlayerGrowthTrajectory(playerId: string) {
    const results = await this.prisma.trainingResult.findMany({
      where: { playerId, performanceScore: { not: null } },
      select: {
        performanceScore: true,
        session: { select: { date: true, sessionType: true } },
      },
      orderBy: { session: { date: "asc" } },
    });
    const windowSize = 4;
    const byWeek = new Map<string, number[]>();
    for (const r of results) {
      const d = r.session.date;
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().slice(0, 10);
      const arr = byWeek.get(key) ?? [];
      arr.push(r.performanceScore!);
      byWeek.set(key, arr);
    }
    const weekEntries = Array.from(byWeek.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, scores]) => ({ weekStart, avgScore: scores.reduce((s, v) => s + v, 0) / scores.length }));
    const trajectory = weekEntries.map((entry, i) => {
      const window = weekEntries.slice(Math.max(0, i - windowSize + 1), i + 1);
      const movingAvg = window.reduce((s, e) => s + e.avgScore, 0) / window.length;
      return { weekStart: entry.weekStart, weekAvg: Math.round(entry.avgScore * 10) / 10, movingAvg: Math.round(movingAvg * 10) / 10 };
    });
    return { playerId, trajectory, dataPoints: trajectory.length };
  }

  getAllWithSession(seasonId?: number) {
    return this.prisma.trainingLoad.findMany({
      where: seasonId ? { session: { seasonId } } : {},
      include: { session: { select: { id: true, date: true, seasonId: true } } },
    });
  }

  getLoadsBetween(playerId: string, from: Date, to: Date) {
    return this.prisma.trainingLoad.findMany({
      where: { playerId, session: { date: { gte: from, lt: to }, cancelledAt: null } },
      select: { load: true, rpe: true, session: { select: { date: true } } },
    });
  }

  findActiveInjuryWithReport(playerId: string) {
    return this.prisma.injury.findFirst({
      where: {
        playerId,
        status: { in: ["OCCURRED", "DIAGNOSED", "REHABILITATING"] },
      },
      select: {
        id: true,
        status: true,
        injuryReport: {
          select: {
            rehabLoadPercentage: true,
            allowedActivities: true,
          },
        },
      },
    });
  }
}
