import { PrismaClient } from "../generated/client";
import { AppError } from "../lib/appError";
import { MatchSquadRepository } from "./match.squad.repo";

export class MatchSquadService {
  constructor(private repo: MatchSquadRepository, private prisma: PrismaClient) {}

  getSquad(matchId: string) {
    return this.repo.findByMatch(matchId);
  }

  async addPlayer(matchId: string, playerId: string) {
    const now = new Date();
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: {
        team: { select: { type: true } },
        contracts: {
          where: { status: 'ACTIVE', startDate: { lte: now }, endDate: { gte: now } },
          select: { id: true },
        },
      },
    });
    if (!player) throw new AppError(404, "PLAYER_NOT_FOUND");
    if (player.team?.type === 'YOUTH' || player.contracts.length === 0)
      throw new AppError(400, "PLAYER_NOT_CONTRACTED_WITH_TEAM");
    return this.repo.addPlayer(matchId, playerId);
  }

  removePlayer(matchId: string, playerId: string) {
    return this.repo.removePlayer(matchId, playerId);
  }

  confirmSquad(matchId: string, confirmedById: string) {
    return this.repo.confirmSquad(matchId, confirmedById);
  }
}
