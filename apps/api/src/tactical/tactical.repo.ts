import { PrismaClient, Prisma } from "../generated/client";
import { CreateAnalysisDto, UpdateAnalysisDto, AddLineupDto, AddMediaDto } from "./dto/tactical.dto";

const n = <T>(v: T | undefined): T | null => v ?? null;
// "" → null, value → trimmed (use inside defined-guard for update data)
const snv = (v: string): string | null => v.trim() === "" ? null : v.trim();

const ANALYSIS_SELECT = {
  id: true,
  matchId: true,
  phase: true,
  status: true,
  formation: true,
  opponentAnalysis: true,
  createdById: true,
  createdAt: true,
  opponentFormation: true,
  opponentKeyThreat: true,
  opponentWeakness: true,
  opponentKeyPlayer: true,
  opponentPressureScore: true,
  opponentSetPieceScore: true,
  opponentCounterScore: true,
  tacticalCompliance: true,
  concededAnalysis: true,
  momPlayerId: true,
  momNote: true,
  improvementPlayerId: true,
  improvementNote: true,
  match: {
    select: {
      homeTeamName: true,
      awayTeamName: true,
      date: true,
      homeScore: true,
      awayScore: true,
    },
  },
  createdBy: { select: { nickname: true } },
  momPlayer: { select: { playerName: true } },
  improvementPlayer: { select: { playerName: true } },
} as const;

export class TacticalRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(filters?: { matchId?: number; phase?: string }) {
    return this.prisma.tacticalAnalysis.findMany({
      where: {
        ...(filters?.matchId && { matchId: filters.matchId }),
        ...(filters?.phase && { phase: filters.phase as "PRE_MATCH" | "POST_MATCH" }),
      },
      select: ANALYSIS_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  findByMatch(matchId: string) {
    return this.prisma.tacticalAnalysis.findMany({
      where: { matchId },
      select: { id: true, phase: true, formation: true, createdAt: true, createdById: true },
    });
  }

  findById(id: string) {
    return this.prisma.tacticalAnalysis.findUnique({
      where: { id },
      include: {
        lineup: { include: { player: { select: { playerName: true } } } },
        media: true,
        momPlayer: { select: { playerName: true } },
        improvementPlayer: { select: { playerName: true } },
      },
    });
  }

  create(dto: CreateAnalysisDto, createdById: string) {
    return this.prisma.tacticalAnalysis.create({
      data: {
        matchId: dto.matchId,
        seasonId: dto.seasonId,
        phase: dto.phase,
        formation: n(dto.formation),
        opponentAnalysis: n(dto.opponentAnalysis),
        opponentFormation: n(dto.opponentFormation),
        opponentKeyThreat: n(dto.opponentKeyThreat),
        opponentWeakness: n(dto.opponentWeakness),
        opponentKeyPlayer: n(dto.opponentKeyPlayer),
        tacticalCompliance: n(dto.tacticalCompliance),
        concededAnalysis: n(dto.concededAnalysis),
        momPlayerId: n(dto.momPlayerId),
        momNote: n(dto.momNote),
        improvementPlayerId: n(dto.improvementPlayerId),
        improvementNote: n(dto.improvementNote),
        createdById,
      },
      select: { id: true, phase: true, formation: true, opponentAnalysis: true, createdAt: true },
    });
  }

  update(id: string, dto: UpdateAnalysisDto) {
    const data: Prisma.TacticalAnalysisUncheckedUpdateInput = {};
    if (dto.formation !== undefined) data.formation = snv(dto.formation);
    if (dto.opponentAnalysis !== undefined) data.opponentAnalysis = snv(dto.opponentAnalysis);
    if (dto.opponentFormation !== undefined) data.opponentFormation = snv(dto.opponentFormation);
    if (dto.opponentKeyThreat !== undefined) data.opponentKeyThreat = snv(dto.opponentKeyThreat);
    if (dto.opponentWeakness !== undefined) data.opponentWeakness = snv(dto.opponentWeakness);
    if (dto.opponentKeyPlayer !== undefined) data.opponentKeyPlayer = snv(dto.opponentKeyPlayer);
    if (dto.opponentPressureScore !== undefined) data.opponentPressureScore = dto.opponentPressureScore;
    if (dto.opponentSetPieceScore !== undefined) data.opponentSetPieceScore = dto.opponentSetPieceScore;
    if (dto.opponentCounterScore !== undefined) data.opponentCounterScore = dto.opponentCounterScore;
    if (dto.tacticalCompliance !== undefined) data.tacticalCompliance = snv(dto.tacticalCompliance);
    if (dto.concededAnalysis !== undefined) data.concededAnalysis = snv(dto.concededAnalysis);
    if (dto.momPlayerId !== undefined) data.momPlayerId = dto.momPlayerId || null;
    if (dto.momNote !== undefined) data.momNote = snv(dto.momNote);
    if (dto.improvementPlayerId !== undefined) data.improvementPlayerId = dto.improvementPlayerId || null;
    if (dto.improvementNote !== undefined) data.improvementNote = snv(dto.improvementNote);
    return this.prisma.tacticalAnalysis.update({
      where: { id },
      data,
      select: ANALYSIS_SELECT,
    });
  }

  addLineup(tacticalAnalysisId: string, dto: AddLineupDto) {
    return this.prisma.tacticalLineup.create({
      data: { tacticalAnalysisId, playerId: dto.playerId, position: dto.position },
    });
  }

  addMedia(tacticalAnalysisId: string, dto: AddMediaDto) {
    return this.prisma.tacticalMedia.create({
      data: { tacticalAnalysisId, url: dto.url, type: dto.type },
    });
  }

  findAllForPlayer(playerId: string) {
    return this.prisma.tacticalAnalysis.findMany({
      where: {
        phase: "POST_MATCH",
        status: "CONFIRMED",
        match: {
          matchLineup: {
            slots: {
              some: { playerId },
            },
          },
        },
      },
      select: ANALYSIS_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  findByIdForPlayer(id: string, playerId: string) {
    return this.prisma.tacticalAnalysis.findFirst({
      where: {
        id,
        phase: "POST_MATCH",
        status: "CONFIRMED",
        match: {
          matchLineup: {
            slots: {
              some: { playerId },
            },
          },
        },
      },
      include: {
        lineup: { include: { player: { select: { playerName: true } } } },
        media: true,
        momPlayer: { select: { playerName: true } },
        improvementPlayer: { select: { playerName: true } },
      },
    });
  }

  confirm(id: string) {
    return this.prisma.tacticalAnalysis.update({
      where: { id },
      data: { status: "CONFIRMED" },
      select: { id: true, status: true },
    });
  }

  async getFormationResultCorrelation(seasonId: number) {
    const analyses = await this.prisma.tacticalAnalysis.findMany({
      where: { seasonId, phase: "PRE_MATCH", formation: { not: null }, status: "CONFIRMED" },
      select: {
        formation: true,
        match: { select: { homeScore: true, awayScore: true, teamId: true } },
      },
    });
    const formationMap = new Map<string, { wins: number; draws: number; losses: number; total: number }>();
    for (const a of analyses) {
      if (!a.formation || a.match.homeScore == null || a.match.awayScore == null) continue;
      const f = a.formation;
      const entry = formationMap.get(f) ?? { wins: 0, draws: 0, losses: 0, total: 0 };
      entry.total++;
      const isHome = !!a.match.teamId;
      const scored = isHome ? a.match.homeScore : a.match.awayScore;
      const conceded = isHome ? a.match.awayScore : a.match.homeScore;
      if (scored > conceded) entry.wins++;
      else if (scored === conceded) entry.draws++;
      else entry.losses++;
      formationMap.set(f, entry);
    }
    return Array.from(formationMap.entries()).map(([formation, stats]) => ({
      formation,
      ...stats,
      winRate: stats.total === 0 ? 0 : Math.round((stats.wins / stats.total) * 100),
    })).sort((a, b) => b.winRate - a.winRate);
  }

  searchOpponentAnalysis(keyword: string, seasonId?: number) {
    return this.prisma.tacticalAnalysis.findMany({
      where: {
        ...(seasonId && { seasonId }),
        OR: [
          { opponentKeyThreat: { contains: keyword, mode: "insensitive" } },
          { opponentWeakness: { contains: keyword, mode: "insensitive" } },
          { opponentAnalysis: { contains: keyword, mode: "insensitive" } },
          { opponentKeyPlayer: { contains: keyword, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        phase: true,
        formation: true,
        opponentAnalysis: true,
        opponentKeyThreat: true,
        opponentWeakness: true,
        opponentKeyPlayer: true,
        match: { select: { id: true, homeTeamName: true, awayTeamName: true, date: true, homeScore: true, awayScore: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
