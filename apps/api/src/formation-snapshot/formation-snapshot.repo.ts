import type { PrismaClient } from "../generated/client";
import type { CreateFormationSnapshotDto } from "./dto/formation-snapshot.dto";

const SNAPSHOT_SELECT = {
  id: true,
  matchId: true,
  minute: true,
  formation: true,
  changeReason: true,
  createdAt: true,
  createdBy: { select: { id: true, nickname: true } },
} as const;

export class FormationSnapshotRepository {
  constructor(private prisma: PrismaClient) {}

  create(dto: CreateFormationSnapshotDto, createdById: string) {
    return this.prisma.formationSnapshot.create({
      data: {
        matchId: dto.matchId,
        formation: dto.formation,
        ...(dto.minute !== undefined && { minute: dto.minute }),
        ...(dto.changeReason !== undefined && { changeReason: dto.changeReason }),
        createdById,
      },
      select: SNAPSHOT_SELECT,
    });
  }

  findByMatch(matchId: number) {
    return this.prisma.formationSnapshot.findMany({
      where: { matchId },
      select: SNAPSHOT_SELECT,
      orderBy: { minute: "asc" },
    });
  }

  remove(id: number) {
    return this.prisma.formationSnapshot.delete({ where: { id } });
  }
}
