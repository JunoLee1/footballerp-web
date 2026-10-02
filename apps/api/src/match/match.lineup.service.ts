import { MatchLineupRepository } from "./match.lineup.repo";
import { AppError } from "../lib/appError";
import type { SaveLineupDto } from "./dto/lineup.dto";
import { NotificationService } from "../notification/notification.service";
import { NotificationRepository } from "../notification/notification.repo";
import { getPrisma } from "../lib/prisma";

const notificationService = new NotificationService(new NotificationRepository(getPrisma()));

const SUPPORTED_FORMATIONS = [
  "4-3-3", "4-4-2", "4-2-3-1", "4-1-4-1",
  "3-5-2", "3-4-3", "5-3-2", "5-4-1",
];

function slotsForFormation(formation: string): number {
  return formation.split("-").reduce((sum, n) => sum + parseInt(n, 10), 0);
}

export class MatchLineupService {
  constructor(private repo: MatchLineupRepository) {}

  async getLineup(matchId: string) {
    const [lineup, matchInfo] = await Promise.all([
      this.repo.findByMatch(matchId),
      this.repo.findMatchInfo(matchId),
    ]);
    const teamType = matchInfo?.team?.type ?? null;

    if (!lineup) return null;
    return { ...lineup, teamType };
  }

  async saveLineup(matchId: string, dto: SaveLineupDto) {
    if (!SUPPORTED_FORMATIONS.includes(dto.formation)) {
      throw new AppError(400, "INVALID_FORMATION");
    }
    const playerIds = dto.slots.map((s) => s.playerId);
    const players = await this.repo.findPlayersByIds(playerIds);
    const ineligible = players.filter(p => p.status === "RELEASED" || p.status === "ON_LOAN");
    if (ineligible.length > 0) {
      throw new AppError(400, "INELIGIBLE_PLAYER_IN_LINEUP");
    }
    const starters = dto.slots.filter(s => s.isStarter);
    const bench = dto.slots.filter(s => !s.isStarter);
    if (starters.length !== 11) {
      throw new AppError(400, "INVALID_STARTER_COUNT");
    }
    if (bench.length > 7) {
      throw new AppError(400, "BENCH_LIMIT_EXCEEDED");
    }
    const outfieldStarters = starters.filter(s => s.slotKey !== "GK");
    if (outfieldStarters.length !== slotsForFormation(dto.formation)) {
      throw new AppError(400, "INVALID_FORMATION");
    }
    if (new Set(playerIds).size !== playerIds.length) {
      throw new AppError(409, "DUPLICATE_PLAYER");
    }
    const slotKeys = dto.slots.map((s) => s.slotKey);
    if (new Set(slotKeys).size !== slotKeys.length) {
      throw new AppError(409, "DUPLICATE_SLOT");
    }
    const injured = await this.repo.findActiveInjuredPlayerIds(playerIds);
    if (injured.length > 0) {
      throw new AppError(409, "INJURED_PLAYER_IN_LINEUP");
    }
    return this.repo.saveLineup(matchId, dto);
  }

  async confirmLineup(matchId: string, confirmedById: string) {
    const lineup = await this.repo.findByMatch(matchId);
    if (!lineup) throw new AppError(404, "LINEUP_NOT_FOUND");
    const result = await this.repo.confirmLineup(matchId, confirmedById);

    Promise.all([
      this.repo.findSlotsWithUsers(matchId),
      this.repo.findMatchInfo(matchId),
    ])
      .then(([slots, matchInfo]) => {
        if (!matchInfo) return;
        return Promise.all(
          slots
            .filter((s) => s.player.userId !== null)
            .map((s) =>
              notificationService.notifyLineupConfirmed(s.player.userId!, s.isStarter, matchInfo, matchId),
            ),
        );
      })
      .catch(console.error);

    return result;
  }
}
