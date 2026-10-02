import { PrismaClient, Prisma } from "../generated/client";
import { ShotResult } from "../generated/enums";
import { CreateMatchDto, UpdateMatchDto, MatchListQuery, UpsertPlayerStatsDto, UpsertTeamStatsDto, CreateShotEventDto } from "./dto/match.dto";

const n = <T>(v: T | undefined): T | null => v ?? null;

const calcTackleRate = (successes: number | undefined, attempts: number | undefined): number | null => {
  if (!attempts || attempts === 0 || successes == null) return null;
  return Math.round((successes / attempts) * 1000) / 10;
};

const XA_WEIGHT: Record<string, number> = {
  STRIKER: 0.7,
  SHADOW_STRIKER: 1.1,
  WINGER: 1.0,
  CENTRAL_ATTACK_MIDFIELDER: 1.1,
  RIGHT_ATTACK_MIDFIELDER: 1.0,
  LEFT_ATTACK_MIDFIELDER: 1.0,
  CENTRAL_DEFENSIVE_MIDFIELDER: 0.6,
  LEFT_DEFENSIVE_MIDFIELDER: 0.6,
  RIGHT_DEFENSIVE_MIDFIELDER: 0.6,
  CENTER_BACK: 0.5,
  LEFT_WING_BACK: 0.5,
  LEFT_FULL_BACK: 0.5,
  RIGHT_WING_BACK: 0.5,
  RIGHT_FULL_BACK: 0.5,
  GOALKEEPER: 0.5,
}

const MATCH_SELECT = {
  id: true,
  date: true,
  homeTeamName: true,
  awayTeamName: true,
  homeScore: true,
  awayScore: true,
  competitionType: true,
  venue: true,
  seasonId: true,
  externalId: true,
  capacity: true,
  actualAttendance: true,
  priceRegular: true,
  priceVip: true,
  extraTime: true,
} as const;

export class MatchRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(query: MatchListQuery) {
    return this.prisma.match.findMany({
      where: {
        ...(query.seasonId && { seasonId: query.seasonId }),
        ...(query.competitionType && { competitionType: query.competitionType }),
      },
      select: MATCH_SELECT,
      orderBy: { date: "desc" },
    });
  }

  async findById(id: string) {
    const row = await this.prisma.match.findUnique({
      where: { id },
      select: {
        ...MATCH_SELECT,
        statSheetRaw: true,
        statSheetImagePath: true,
        playerMatchStats: {
          select: {
            id: true,
            playerId: true,
            goals: true,
            assists: true,
            xG: true,
            xA: true,
            shots: true,
            passesAttempted: true,
            passesCompleted: true,
            keyPasses: true,
            tackles: true,
            tacklesAttempted: true,
            tackleSuccessRate: true,
            clearances: true,
            interceptions: true,
            saves: true,
            cleanSheet: true,
            minutesPlayed: true,
            aerialDuels: true,
            aerialDuelsAttempted: true,
            aerialDuelSuccessRate: true,
            groundDuels: true,
            groundDuelsAttempted: true,
            groundDuelSuccessRate: true,
            ballRecoveries: true,
            turnovers: true,
            distanceCovered: true,
            sprint: true,
            clearCutChanceRate: true,
            penaltyConversionRate: true,
            freeKickConversionRate: true,
            foulsCommitted: true,
            crossesCompleted: true,
            shotsOnTarget: true,
            shotsAllowed: true,
            shotBlocked: true,
            dribblesAttempted: true,
            dribblesCompleted: true,
            dribblesFailed: true,
            longPassesAttempted: true,
            longPassesCompleted: true,
            player: { select: { playerName: true, position: true } },
          },
        },
        teamMatchStats: true,
      },
    });
    if (!row) return null;
    const squadCount = await this.prisma.matchSquad.count({ where: { matchId: id } });
    return { ...row, hasSquad: squadCount > 0 };
  }

  create(data: CreateMatchDto) {
    return this.prisma.match.create({
      data: {
        date: new Date(data.date),
        homeTeamName: data.homeTeamName,
        awayTeamName: data.awayTeamName,
        competitionType: data.competitionType,
        seasonId: data.seasonId,
        ...(data.externalId && { externalId: data.externalId }),
        ...(data.venue && { venue: data.venue }),
        ...(data.priceRegular !== undefined && { priceRegular: data.priceRegular }),
        ...(data.priceVip !== undefined && { priceVip: data.priceVip }),
      },
      select: MATCH_SELECT,
    });
  }

  update(id: string, data: UpdateMatchDto) {
    return this.prisma.match.update({
      where: { id },
      data: {
        ...(data.date && { date: new Date(data.date) }),
        ...(data.homeTeamName && { homeTeamName: data.homeTeamName }),
        ...(data.awayTeamName && { awayTeamName: data.awayTeamName }),
        ...(data.homeScore !== undefined && { homeScore: data.homeScore }),
        ...(data.awayScore !== undefined && { awayScore: data.awayScore }),
        ...(data.competitionType && { competitionType: data.competitionType }),
        ...(data.venue && { venue: data.venue }),
        ...(data.priceRegular !== undefined && { priceRegular: data.priceRegular }),
        ...(data.priceVip !== undefined && { priceVip: data.priceVip }),
      },
      select: MATCH_SELECT,
    });
  }

  findPlayerStats(matchId: string, playerId: string) {
    return this.prisma.playerMatchStats.findUnique({
      where: { matchId_playerId: { matchId, playerId } },
    });
  }

  async findLineupPlayerIds(matchId: string): Promise<string[]> {
    const lineup = await this.prisma.matchLineup.findUnique({
      where: { matchId },
      select: { slots: { select: { playerId: true } } },
    });
    return lineup?.slots.map((s) => s.playerId) ?? [];
  }

  async findSubstitutionForPlayer(matchId: string, playerId: string) {
    const [subOff, subOn] = await Promise.all([
      this.prisma.substitutionEvent.findFirst({
        where: { matchId, fromPlayerId: playerId },
      }),
      this.prisma.substitutionEvent.findFirst({
        where: { matchId, toPlayerId: playerId },
      }),
    ]);
    return { subOff, subOn };
  }

  createPlayerStats(matchId: string, dto: UpsertPlayerStatsDto) {
    return this.prisma.playerMatchStats.create({
      data: {
        matchId,
        playerId: dto.playerId,
        goals: n(dto.goals),
        assists: n(dto.assists),
        xG: n(dto.xG),
        xA: n(dto.xA),
        shots: n(dto.shots),
        passesAttempted: n(dto.passesAttempted),
        passesCompleted: n(dto.passesCompleted),
        keyPasses: n(dto.keyPasses),
        tackles: n(dto.tackles),
        tacklesAttempted: n(dto.tacklesAttempted),
        tackleSuccessRate: calcTackleRate(dto.tackles, dto.tacklesAttempted),
        clearances: n(dto.clearances),
        interceptions: n(dto.interceptions),
        saves: n(dto.saves),
        cleanSheet: n(dto.cleanSheet),
        minutesPlayed: n(dto.minutesPlayed),
        aerialDuels: n(dto.aerialDuels),
        aerialDuelsAttempted: n(dto.aerialDuelsAttempted),
        aerialDuelSuccessRate: calcTackleRate(dto.aerialDuels, dto.aerialDuelsAttempted),
        groundDuels: n(dto.groundDuels),
        groundDuelsAttempted: n(dto.groundDuelsAttempted),
        groundDuelSuccessRate: calcTackleRate(dto.groundDuels, dto.groundDuelsAttempted),
        ballRecoveries: n(dto.ballRecoveries),
        turnovers: n(dto.turnovers),
        distanceCovered: n(dto.distanceCovered),
        sprint: n(dto.sprint),
        clearCutChanceRate: n(dto.clearCutChanceRate),
        penaltyConversionRate: n(dto.penaltyConversionRate),
        freeKickConversionRate: n(dto.freeKickConversionRate),
        foulsCommitted: n(dto.foulsCommitted),
        crossesCompleted: n(dto.crossesCompleted),
        shotsOnTarget: n(dto.shotsOnTarget),
        shotsAllowed: n(dto.shotsAllowed),
        shotBlocked: n(dto.shotBlocked),
        dribblesAttempted: n(dto.dribblesAttempted),
        dribblesCompleted: n(dto.dribblesCompleted),
        dribblesFailed: n(dto.dribblesFailed),
        longPassesAttempted: n(dto.longPassesAttempted),
        longPassesCompleted: n(dto.longPassesCompleted),
      },
    });
  }

  updatePlayerStats(id: string, dto: UpsertPlayerStatsDto) {
    return this.prisma.playerMatchStats.update({
      where: { id },
      data: {
        goals: n(dto.goals),
        assists: n(dto.assists),
        xG: n(dto.xG),
        xA: n(dto.xA),
        shots: n(dto.shots),
        passesAttempted: n(dto.passesAttempted),
        passesCompleted: n(dto.passesCompleted),
        keyPasses: n(dto.keyPasses),
        tackles: n(dto.tackles),
        tacklesAttempted: n(dto.tacklesAttempted),
        tackleSuccessRate: calcTackleRate(dto.tackles, dto.tacklesAttempted),
        clearances: n(dto.clearances),
        interceptions: n(dto.interceptions),
        saves: n(dto.saves),
        cleanSheet: n(dto.cleanSheet),
        minutesPlayed: n(dto.minutesPlayed),
        aerialDuels: n(dto.aerialDuels),
        aerialDuelsAttempted: n(dto.aerialDuelsAttempted),
        aerialDuelSuccessRate: calcTackleRate(dto.aerialDuels, dto.aerialDuelsAttempted),
        groundDuels: n(dto.groundDuels),
        groundDuelsAttempted: n(dto.groundDuelsAttempted),
        groundDuelSuccessRate: calcTackleRate(dto.groundDuels, dto.groundDuelsAttempted),
        ballRecoveries: n(dto.ballRecoveries),
        turnovers: n(dto.turnovers),
        distanceCovered: n(dto.distanceCovered),
        sprint: n(dto.sprint),
        clearCutChanceRate: n(dto.clearCutChanceRate),
        penaltyConversionRate: n(dto.penaltyConversionRate),
        freeKickConversionRate: n(dto.freeKickConversionRate),
        foulsCommitted: n(dto.foulsCommitted),
        crossesCompleted: n(dto.crossesCompleted),
        shotsOnTarget: n(dto.shotsOnTarget),
        shotsAllowed: n(dto.shotsAllowed),
        shotBlocked: n(dto.shotBlocked),
        dribblesAttempted: n(dto.dribblesAttempted),
        dribblesCompleted: n(dto.dribblesCompleted),
        dribblesFailed: n(dto.dribblesFailed),
        longPassesAttempted: n(dto.longPassesAttempted),
        longPassesCompleted: n(dto.longPassesCompleted),
      },
    });
  }

  upsertTeamStats(matchId: string, dto: UpsertTeamStatsDto) {
    return this.prisma.teamMatchStats.upsert({
      where: { matchId },
      create: {
        matchId,
        possession: dto.possession,
        yellowCards: dto.yellowCards,
        redCards: dto.redCards,
        corners: dto.corners,
        offsides: dto.offsides,
        shots: 0,
        shotsOnTarget: 0,
        passes: 0,
        passAccuracy: 0,
        fouls: 0,
        xG: 0,
        tackles: 0,
        interceptions: 0,
        clearances: 0,
        ...(dto.oppShots !== undefined && { oppShots: dto.oppShots }),
        ...(dto.oppShotsOnTarget !== undefined && { oppShotsOnTarget: dto.oppShotsOnTarget }),
        ...(dto.oppCorners !== undefined && { oppCorners: dto.oppCorners }),
        ...(dto.oppFouls !== undefined && { oppFouls: dto.oppFouls }),
        ...(dto.oppYellowCards !== undefined && { oppYellowCards: dto.oppYellowCards }),
        ...(dto.oppRedCards !== undefined && { oppRedCards: dto.oppRedCards }),
        ...(dto.oppXG !== undefined && { oppXG: dto.oppXG }),
        ...(dto.oppOffsides !== undefined && { oppOffsides: dto.oppOffsides }),
        ...(dto.oppPossession !== undefined && { oppPossession: dto.oppPossession }),
        ...(dto.oppGoals      !== undefined && { oppGoals: dto.oppGoals }),
      },
      update: {
        possession: dto.possession,
        yellowCards: dto.yellowCards,
        redCards: dto.redCards,
        corners: dto.corners,
        offsides: dto.offsides,
        ...(dto.oppShots !== undefined && { oppShots: dto.oppShots }),
        ...(dto.oppShotsOnTarget !== undefined && { oppShotsOnTarget: dto.oppShotsOnTarget }),
        ...(dto.oppCorners !== undefined && { oppCorners: dto.oppCorners }),
        ...(dto.oppFouls !== undefined && { oppFouls: dto.oppFouls }),
        ...(dto.oppYellowCards !== undefined && { oppYellowCards: dto.oppYellowCards }),
        ...(dto.oppRedCards !== undefined && { oppRedCards: dto.oppRedCards }),
        ...(dto.oppXG !== undefined && { oppXG: dto.oppXG }),
        ...(dto.oppOffsides !== undefined && { oppOffsides: dto.oppOffsides }),
        ...(dto.oppPossession !== undefined && { oppPossession: dto.oppPossession }),
        ...(dto.oppGoals      !== undefined && { oppGoals: dto.oppGoals }),
      },
    });
  }

  async recalculateTeamStats(matchId: string): Promise<void> {
    const stats = await this.prisma.playerMatchStats.findMany({
      where: { matchId },
      select: {
        shots: true,
        goals: true,
        shotsOnTarget: true,
        passesAttempted: true,
        passesCompleted: true,
        foulsCommitted: true,
        tackles: true,
        interceptions: true,
        clearances: true,
        shotsAllowed: true,
      },
    });

    const shots           = stats.reduce((s, r) => s + (r.shots        ?? 0), 0);
    const goals           = stats.reduce((s, r) => s + (r.goals        ?? 0), 0);
    const playerOnTarget  = stats.reduce((s, r) => s + (r.shotsOnTarget ?? 0), 0);
    const attempted    = stats.reduce((s, r) => s + (r.passesAttempted ?? 0), 0);
    const completed    = stats.reduce((s, r) => s + (r.passesCompleted ?? 0), 0);
    const fouls        = stats.reduce((s, r) => s + (r.foulsCommitted  ?? 0), 0);
    const tackles      = stats.reduce((s, r) => s + (r.tackles         ?? 0), 0);
    const interceptions = stats.reduce((s, r) => s + (r.interceptions  ?? 0), 0);
    const clearances   = stats.reduce((s, r) => s + (r.clearances      ?? 0), 0);

    const shotEvents = await this.prisma.shotEvent.findMany({
      where: { matchId },
      select: { xG: true, result: true },
    });
    // 우선순위: shot events > player shotsOnTarget 합산 > goals (floor)
    const shotsOnTarget = Math.max(
      shotEvents.filter(e => e.result === 'GOAL' || e.result === 'ON_TARGET').length,
      playerOnTarget,
      goals,
    );
    const xG = Math.round(shotEvents.reduce((s, e) => s + e.xG, 0) * 100) / 100;
    const passAccuracy = attempted > 0 ? Math.round((completed / attempted) * 1000) / 10 : 0;

    const autoFields = { shots, shotsOnTarget, passes: attempted, passAccuracy, fouls, xG, tackles, interceptions, clearances };
    await this.prisma.teamMatchStats.upsert({
      where: { matchId },
      update: autoFields,
      create: {
        matchId,
        possession: 0,
        yellowCards: 0,
        redCards: 0,
        corners: 0,
        offsides: 0,
        ...autoFields,
      },
    });
  }

  findShotEvents(matchId: string) {
    return this.prisma.shotEvent.findMany({
      where: { matchId },
      include: {
        shooter:  { select: { id: true, playerName: true, position: true } },
        assister: { select: { id: true, playerName: true, position: true } },
      },
      orderBy: [{ minute: 'asc' }, { id: 'asc' }],
    });
  }

  createShotEvent(matchId: string, dto: CreateShotEventDto) {
    return this.prisma.shotEvent.create({
      data: {
        matchId,
        shooterId:                dto.shooterId,
        assisterId:               dto.assisterId ?? null,
        assisterPositionOverride: dto.assisterPositionOverride ?? null,
        xG:                       dto.xG,
        result:                   dto.result as ShotResult,
        minute:                   dto.minute ?? null,
      },
      include: {
        shooter:  { select: { id: true, playerName: true, position: true } },
        assister: { select: { id: true, playerName: true, position: true } },
      },
    });
  }

  deleteShotEvent(id: number) {
    return this.prisma.shotEvent.delete({ where: { id } });
  }

  async recalculateXgXa(matchId: string): Promise<void> {
    const shots = await this.prisma.shotEvent.findMany({
      where: { matchId },
      include: {
        shooter:  { select: { id: true, position: true } },
        assister: { select: { id: true, position: true } },
      },
    });

    const xgMap: Record<string, number> = {};
    const xaMap: Record<string, number> = {};
    const keyPassMap: Record<string, number> = {};
    const onTargetMap: Record<string, number> = {};

    for (const shot of shots) {
      xgMap[shot.shooterId] = (xgMap[shot.shooterId] ?? 0) + shot.xG;
      if (shot.result === 'GOAL' || shot.result === 'ON_TARGET') {
        onTargetMap[shot.shooterId] = (onTargetMap[shot.shooterId] ?? 0) + 1;
      }
      if (shot.assisterId && shot.assister) {
        const effectivePosition = shot.assisterPositionOverride ?? shot.assister.position;
        const weight = XA_WEIGHT[effectivePosition] ?? 0.7;
        xaMap[shot.assisterId] = (xaMap[shot.assisterId] ?? 0) + shot.xG * weight;
        keyPassMap[shot.assisterId] = (keyPassMap[shot.assisterId] ?? 0) + 1;
      }
    }

    const playerIds = new Set([...Object.keys(xgMap), ...Object.keys(xaMap), ...Object.keys(keyPassMap)]);
    for (const playerId of playerIds) {
      const xG           = xgMap[playerId]      != null ? Math.round(xgMap[playerId] * 100) / 100 : undefined;
      const xA           = xaMap[playerId]      != null ? Math.round(xaMap[playerId] * 100) / 100 : undefined;
      const keyPasses    = keyPassMap[playerId] != null ? keyPassMap[playerId]                      : undefined;
      const shotsOnTarget = onTargetMap[playerId] ?? 0;
      await this.prisma.playerMatchStats.upsert({
        where: { matchId_playerId: { matchId, playerId } },
        create: { matchId, playerId, shotsOnTarget, ...(xG != null && { xG }), ...(xA != null && { xA }), ...(keyPasses != null && { keyPasses }) },
        update: {                    shotsOnTarget,   ...(xG != null && { xG }), ...(xA != null && { xA }), ...(keyPasses != null && { keyPasses }) },
      });
    }
  }

  updateStatSheet(id: string, statSheetRaw: unknown, statSheetImagePath: string) {
    return this.prisma.match.update({
      where: { id },
      data: { statSheetRaw: statSheetRaw as Prisma.InputJsonValue, statSheetImagePath },
      select: { id: true, statSheetRaw: true, statSheetImagePath: true },
    });
  }
}
