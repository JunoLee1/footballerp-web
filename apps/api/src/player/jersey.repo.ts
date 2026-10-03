import { PrismaClient, JerseyNumberStatus } from "../generated/client";
import { AssignJerseyDto, UpdateJerseyStatusDto } from "./dto/jersey.dto";

export class JerseyRepository {
  constructor(private prisma: PrismaClient) {}

  findByTeam(teamId: string) {
    return this.prisma.jerseyNumber.findMany({
      where: { teamId },
      include: { player: { select: { id: true, playerName: true, position: true } } },
      orderBy: { number: "asc" },
    });
  }

  findByPlayer(playerId: string) {
    return this.prisma.jerseyNumber.findMany({
      where: { playerId },
      select: { id: true, number: true, status: true, teamId: true },
    });
  }

  findByNumberAndTeam(number: number, teamId: string) {
    return this.prisma.jerseyNumber.findUnique({
      where: { number_teamId: { number, teamId } },
      include: { player: { select: { id: true, playerName: true } } },
    });
  }

  create(teamId: string, dto: AssignJerseyDto) {
    return this.prisma.jerseyNumber.create({
      data: {
        number: dto.number,
        teamId,
        playerId: dto.playerId ?? null,
        status: dto.status ?? (dto.playerId ? "OCCUPIED" : "AVAILABLE"),
      },
    });
  }

  updateStatus(id: string, dto: UpdateJerseyStatusDto) {
    return this.prisma.jerseyNumber.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.playerId !== undefined && { playerId: dto.playerId }),
      },
    });
  }

  findPlayerUserId(playerId: string) {
    return this.prisma.player.findUnique({
      where: { id: playerId },
      select: { userId: true },
    });
  }
}
