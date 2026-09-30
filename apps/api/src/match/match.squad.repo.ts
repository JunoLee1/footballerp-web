import { PrismaClient } from "../generated/client";

export class MatchSquadRepository {
  constructor(private prisma: PrismaClient) {}

  findByMatch(matchId: number) {
    return this.prisma.matchSquad.findMany({
      where: { matchId },
      include: {
        player: { select: { id: true, playerName: true, position: true, userId: true } },
      },
      orderBy: { player: { playerName: "asc" } },
    });
  }

  addPlayer(matchId: number, playerId: string) {
    return this.prisma.matchSquad.upsert({
      where: { matchId_playerId: { matchId, playerId } },
      create: { matchId, playerId },
      update: {},
    });
  }

  removePlayer(matchId: number, playerId: string) {
    return this.prisma.matchSquad.delete({
      where: { matchId_playerId: { matchId, playerId } },
    });
  }

  confirmSquad(matchId: number, confirmedById: string) {
    return this.prisma.matchSquad.updateMany({
      where: { matchId },
      data: { isConfirmed: true, confirmedAt: new Date(), confirmedById },
    });
  }

  findConfirmedWithPlayers(matchId: number) {
    return this.prisma.matchSquad.findMany({
      where: { matchId, isConfirmed: true },
      include: {
        player: {
          select: { id: true, playerName: true, userId: true },
        },
        match: {
          select: { id: true, date: true, homeTeamName: true, awayTeamName: true, venue: true },
        },
      },
    });
  }

  findUnnotifiedForDate(date: Date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return this.prisma.matchSquad.findMany({
      where: {
        isConfirmed: true,
        notifiedAt: null,
        match: { date: { gte: start, lte: end } },
      },
      include: {
        player: { select: { id: true, playerName: true, userId: true, guardianId: true } },
        match: {
          select: { id: true, date: true, homeTeamName: true, awayTeamName: true, venue: true },
        },
      },
    });
  }

  markNotified(matchId: number) {
    return this.prisma.matchSquad.updateMany({
      where: { matchId, notifiedAt: null },
      data: { notifiedAt: new Date() },
    });
  }
}
