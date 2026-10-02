import { PrismaClient } from "../generated/client";
import type { SaveLineupDto } from "./dto/lineup.dto";

const PLAYER_SELECT = { id: true, playerName: true, position: true } as const;

export class MatchLineupRepository {
  constructor(private prisma: PrismaClient) {}

  findByMatch(matchId: string) {
    return this.prisma.matchLineup.findUnique({
      where: { matchId },
      include: {
        slots: {
          include: { player: { select: PLAYER_SELECT } },
        },
      },
    });
  }

  async saveLineup(matchId: string, dto: SaveLineupDto) {
    return this.prisma.$transaction(async (tx) => {
      const lineup = await tx.matchLineup.upsert({
        where: { matchId },
        create: { matchId, formation: dto.formation },
        update: { formation: dto.formation },
      });
      await tx.lineupSlot.deleteMany({ where: { lineupId: lineup.id } });
      if (dto.slots.length > 0) {
        await tx.lineupSlot.createMany({
          data: dto.slots.map((s) => ({
            lineupId: lineup.id,
            playerId: s.playerId,
            slotKey: s.slotKey,
            isStarter: s.isStarter,
          })),
        });
      }
      return tx.matchLineup.findUnique({
        where: { id: lineup.id },
        include: {
          slots: {
            include: { player: { select: PLAYER_SELECT } },
          },
        },
      });
    });
  }

  findSlotsWithUsers(matchId: string) {
    return this.prisma.lineupSlot.findMany({
      where: { lineup: { matchId } },
      select: {
        isStarter: true,
        player: { select: { userId: true } },
      },
    });
  }

  findMatchInfo(matchId: string) {
    return this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        homeTeamName: true,
        awayTeamName: true,
        team: { select: { id: true, type: true } },
      },
    });
  }

  findSquadPlayers(matchId: string) {
    return this.prisma.matchSquad.findMany({
      where: { matchId },
      include: { player: { select: PLAYER_SELECT } },
    });
  }

  // BH9: players with matchAvailable=true AND medicalSignedAt signed are NOT blocked
  findActiveInjuredPlayerIds(playerIds: string[]) {
    return this.prisma.injury.findMany({
      where: {
        playerId: { in: playerIds },
        status: { not: "RETURNED" as any },
        NOT: {
          injuryReport: {
            matchAvailable: true,
            medicalSignedAt: { not: null },
          },
        },
      },
      select: { playerId: true },
    });
  }

  findPlayersByIds(playerIds: string[]) {
    return this.prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, status: true },
    });
  }

  confirmLineup(matchId: string, confirmedById: string) {
    return this.prisma.matchLineup.update({
      where: { matchId },
      data: { isConfirmed: true, confirmedAt: new Date(), confirmedById },
    });
  }
}
