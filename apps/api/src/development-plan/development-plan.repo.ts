import { PrismaClient } from "../generated/client";
import { CreatePlanDto, UpdatePlanDto, PlanListQuery } from "./dto/development-plan.dto";
import { PlayerDevelopmentPlanStatus } from "../generated/enums";

const SELECT = {
  id: true,
  playerId: true,
  coachId: true,
  seasonId: true,
  goals: true,
  notes: true,
  status: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  player: { select: { playerName: true, position: true } },
  coach: { select: { id: true, username: true, nickname: true } },
  season: { select: { id: true, name: true } },
};

export class DevelopmentPlanRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(query: PlanListQuery) {
    return this.prisma.playerDevelopmentPlan.findMany({
      where: {
        ...(query.playerId && { playerId: query.playerId }),
        ...(query.seasonId && { seasonId: query.seasonId }),
      },
      select: SELECT,
      orderBy: { updatedAt: "desc" },
    });
  }

  findById(id: number) {
    return this.prisma.playerDevelopmentPlan.findUnique({
      where: { id },
      select: SELECT,
    });
  }

  create(dto: CreatePlanDto & { coachId: string }) {
    return this.prisma.playerDevelopmentPlan.create({
      data: {
        playerId: dto.playerId,
        coachId: dto.coachId,
        seasonId: dto.seasonId,
        goals: dto.goals,
        notes: dto.notes ?? null,
      },
      select: SELECT,
    });
  }

  update(id: number, dto: UpdatePlanDto) {
    return this.prisma.playerDevelopmentPlan.update({
      where: { id },
      data: {
        ...(dto.goals !== undefined && { goals: dto.goals }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      select: SELECT,
    });
  }

  updateStatus(id: number, status: PlayerDevelopmentPlanStatus, reviewedAt?: Date) {
    return this.prisma.playerDevelopmentPlan.update({
      where: { id },
      data: {
        status,
        ...(reviewedAt && { reviewedAt }),
      },
      select: SELECT,
    });
  }

  findActiveByPlayer(playerId: string) {
    return this.prisma.playerDevelopmentPlan.findFirst({
      where: { playerId, status: "ACTIVE" },
      select: { id: true },
    });
  }

  findPlayerUserId(playerId: string) {
    return this.prisma.player.findUnique({
      where: { id: playerId },
      select: { userId: true },
    });
  }
}
