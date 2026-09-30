import { PrismaClient, Prisma } from "../generated/client";
import type { SaveSquadPlanDto } from "./dto/squad-plan.dto";

export class SquadPlanRepository {
  constructor(private prisma: PrismaClient) {}

  findBySeasonId(seasonId: number) {
    return this.prisma.squadPlan.findUnique({
      where: { seasonId },
      select: {
        id: true,
        seasonId: true,
        formation: true,
        slots: true,
        updatedAt: true,
        updatedBy: { select: { nickname: true } },
      },
    });
  }

  upsert(dto: SaveSquadPlanDto, updatedById: string) {
    return this.prisma.squadPlan.upsert({
      where: { seasonId: dto.seasonId },
      create: {
        seasonId: dto.seasonId,
        formation: dto.formation,
        slots: dto.slots as Prisma.InputJsonValue,
        updatedById,
      },
      update: {
        formation: dto.formation,
        slots: dto.slots as Prisma.InputJsonValue,
        updatedById,
      },
      select: {
        id: true,
        seasonId: true,
        formation: true,
        slots: true,
        updatedAt: true,
        updatedBy: { select: { nickname: true } },
      },
    });
  }
}
