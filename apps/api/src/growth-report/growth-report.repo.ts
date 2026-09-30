import type { PrismaClient } from "../generated/client";
import type { CreateGrowthEvaluationDto, AwardBadgeDto } from "./dto/growth-report.dto";

const EVAL_INCLUDE = {
  player: { select: { id: true, playerName: true, guardianId: true } },
  coach: { select: { id: true, username: true, nickname: true } },
  plan: { select: { id: true, goals: true, seasonId: true } },
} as const;

const BADGE_INCLUDE = {
  player: { select: { id: true, playerName: true } },
  coach: { select: { id: true, username: true, nickname: true } },
  session: { select: { id: true, date: true } },
} as const;

export class GrowthReportRepository {
  constructor(private prisma: PrismaClient) {}

  findEvaluationsByPlayer(playerId: string) {
    return this.prisma.growthEvaluation.findMany({
      where: { playerId },
      include: EVAL_INCLUDE,
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
  }

  findPublishedEvaluationsByPlayer(playerId: string) {
    return this.prisma.growthEvaluation.findMany({
      where: { playerId, isPublished: true },
      include: EVAL_INCLUDE,
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
  }

  findEvaluationById(id: number) {
    return this.prisma.growthEvaluation.findUnique({ where: { id }, include: EVAL_INCLUDE });
  }

  findEvaluationByPeriod(playerId: string, year: number, month: number) {
    return this.prisma.growthEvaluation.findUnique({
      where: { playerId_year_month: { playerId, year, month } },
      include: EVAL_INCLUDE,
    });
  }

  createEvaluation(dto: CreateGrowthEvaluationDto, coachId: string, planId?: string) {
    return this.prisma.growthEvaluation.create({
      data: { ...dto, coachId, ...(planId !== undefined && { planId }) },
      include: EVAL_INCLUDE,
    });
  }

  updateEvaluation(id: number, dto: Partial<CreateGrowthEvaluationDto>) {
    return this.prisma.growthEvaluation.update({
      where: { id },
      data: dto,
      include: EVAL_INCLUDE,
    });
  }

  publishEvaluation(id: number) {
    return this.prisma.growthEvaluation.update({
      where: { id },
      data: { isPublished: true, publishedAt: new Date() },
      include: EVAL_INCLUDE,
    });
  }

  findBadgesByPlayer(playerId: string) {
    return this.prisma.playerBadge.findMany({
      where: { playerId },
      include: BADGE_INCLUDE,
      orderBy: { awardedAt: "desc" },
    });
  }

  awardBadge(dto: AwardBadgeDto, coachId: string) {
    return this.prisma.playerBadge.create({
      data: { ...dto, coachId },
      include: BADGE_INCLUDE,
    });
  }

  async getPositionAverage(playerId: string) {
    const player = await this.prisma.player.findFirst({
      where: { id: playerId },
      select: { position: true },
    });
    if (!player) return null;

    const peerFilter = { isPublished: true, player: { position: player.position }, playerId: { not: playerId } };

    const [agg, sampleCount] = await Promise.all([
      this.prisma.growthEvaluation.aggregate({
        where: peerFilter,
        _avg: {
          attitudeScore: true,
          fundamentalsScore: true,
          spatialScore: true,
          physicalScore: true,
        },
      }),
      this.prisma.growthEvaluation.count({ where: peerFilter }),
    ]);
    // playerId excluded from peerFilter so the player is not compared against themselves.

    return {
      position: player.position,
      sampleCount,
      avgAttitudeScore: agg._avg.attitudeScore ?? null,
      avgFundamentalsScore: agg._avg.fundamentalsScore ?? null,
      avgSpatialScore: agg._avg.spatialScore ?? null,
      avgPhysicalScore: agg._avg.physicalScore ?? null,
    };
  }
}
