import { PrismaClient, Prisma } from "../generated/client";
import { ProspectStatus, VideoEvalResult, EvaluationLogType, PlayStyle } from "../generated/enums";
import { AppError } from "../lib/appError";
import { encrypt } from "../lib/crypto";
import { CreateProspectDto, UpdateProspectDto, SignProspectDto, ProspectMedicalResultDto, CreateProspectNegotiationLogDto } from "./dto/prospect.dto";
import { CreateProspectVideoEvaluationDto, CreateProspectEvaluationLogDto, UpdateProspectVideoEvaluationDto } from "./dto/video-evaluation.dto";

const PROSPECT_SELECT = {
  id: true,
  name: true,
  nationalityId: true,
  nationality: { select: { id: true, name: true, code: true } },
  position: true,
  currentTeam: true,
  notes: true,
  status: true,
  playStyle: true,
  convertedPlayerId: true,
  createdAt: true,
  createdBy: { select: { nickname: true } },
  visaRequired: true,
  visaEligibility: true,
  currentMarketValue: true,
} as const;

const VALID_TRANSITIONS: Record<ProspectStatus, ProspectStatus[]> = {
  LONGLIST:         ["PRE_SHORTLIST", "ARCHIVED"],
  PRE_SHORTLIST:    ["SHORTLIST", "ARCHIVED"],
  SHORTLIST:        ["ACTIVE", "ARCHIVED"],
  ACTIVE:           ["MEDICAL_TEST", "ARCHIVED"],
  MEDICAL_TEST:     ["CONTRACT_PENDING", "ARCHIVED"],
  CONTRACT_PENDING: ["ARCHIVED"],
  SIGNED:           [],
  ARCHIVED:         [],
};

export class ProspectRepository {
  constructor(private prisma: PrismaClient) {}

  async checkDuplicate(name: string, currentTeam?: string) {
    const [prospects, squadPlayers] = await Promise.all([
      this.prisma.prospect.findMany({
        where: {
          name: { equals: name, mode: "insensitive" },
          ...(currentTeam ? { currentTeam: { equals: currentTeam, mode: "insensitive" } } : {}),
          status: { notIn: ["SIGNED", "ARCHIVED"] },
        },
        select: { id: true, name: true, currentTeam: true, position: true, status: true },
      }),
      this.prisma.player.findMany({
        where: {
          playerName: { equals: name, mode: "insensitive" },
          status: { notIn: ["RETIRED", "RELEASED"] },
        },
        select: { id: true, playerName: true, position: true, status: true },
      }),
    ]);
    return { prospects, squadPlayers };
  }

  findAll(status?: ProspectStatus, clubId?: string | null) {
    return this.prisma.prospect.findMany({
      where: {
        ...(status !== undefined && { status }),
        ...(clubId != null && { clubId }),
      },
      select: PROSPECT_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  findById(id: string, clubId?: string | null) {
    return this.prisma.prospect.findFirst({
      where: { id, ...(clubId != null && { clubId }) }, //TODO: 전사 관리자 외 타구단 사람들도 조회 가능 하다면 수정
      select: PROSPECT_SELECT,
    });
  }

  async getClubLeagueCountryIds(clubId: string): Promise<number[]> {
    const links = await this.prisma.clubLeague.findMany({
      where: { clubId, league: { isActive: true } },
      select: { league: { select: { countryId: true } } },
    });
    return links.map(l => l.league.countryId).filter((id): id is number => id != null);
  }

  create(dto: CreateProspectDto, clubId?: string | null, createdById?: string, visaRequired?: boolean) {
    return this.prisma.prospect.create({
      data: {
        name: dto.name,
        nationalityId: dto.nationalityId,
        position: dto.position ?? null,
        currentTeam: dto.currentTeam ?? null,
        notes: dto.notes ?? null,
        createdById: createdById ?? null,
        status: dto.status ?? "LONGLIST",
        playStyle: (dto.playStyle ?? null) as PlayStyle | null,
        clubId: clubId ?? null,
        ...(visaRequired !== undefined && { visaRequired }),
      },
      select: PROSPECT_SELECT,
    });
  }

  update(id: string, dto: UpdateProspectDto) {
    return this.prisma.prospect.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.nationalityId !== undefined && { nationalityId: dto.nationalityId }),
        ...(dto.position !== undefined && { position: dto.position }),
        ...(dto.currentTeam !== undefined && { currentTeam: dto.currentTeam }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.visaRequired !== undefined && { visaRequired: dto.visaRequired }),
        ...(dto.visaEligibility !== undefined && { visaEligibility: dto.visaEligibility }),
        ...(dto.currentMarketValue !== undefined && { currentMarketValue: dto.currentMarketValue }),
      },
      select: PROSPECT_SELECT,
    });
  }

  async updateStatus(id: string, status: ProspectStatus) {
    const prospect = await this.prisma.prospect.findUnique({ where: { id }, select: { status: true } });
    if (!prospect) throw new AppError(404, "PROSPECT_NOT_FOUND");
    const allowed = VALID_TRANSITIONS[prospect.status];
    if (!allowed.includes(status)) throw new AppError(409, "INVALID_STATUS_TRANSITION");
    return this.prisma.prospect.update({ where: { id }, data: { status }, select: PROSPECT_SELECT });
  }

  async sign(prospectId: string, dto: SignProspectDto) {
    const prospect = await this.prisma.prospect.findUnique({
      where: { id: prospectId },
      select: { id: true, status: true, name: true, position: true, playStyle: true, nationalityId: true },
    });
    if (!prospect) throw new AppError(404, "PROSPECT_NOT_FOUND");
    if (prospect.status !== "CONTRACT_PENDING") throw new AppError(409, "INVALID_STATUS_TRANSITION");
    return this.prisma.$transaction(async (tx) => {
      const encDob = encrypt(new Date(dto.dateOfBirth).toISOString());
      const player = await tx.player.create({
        data: {
          playerName: prospect.name,
          dateOfBirthEncrypted: encDob.encrypted,
          dateOfBirthIv: encDob.iv,
          preferredFoot: dto.preferredFoot ?? "RIGHT",
          height: dto.height,
          weight: dto.weight,
          position: dto.position ?? prospect.position ?? "STRIKER",
          level: "ROOKIE",
          status: "ACTIVE",
          ...(prospect.nationalityId != null && { nationalityId: prospect.nationalityId }),
          workPermitStatus: dto.workPermitStatus ?? "NOT_REQUIRED",
          workPermitExpiry: dto.workPermitExpiry ? new Date(dto.workPermitExpiry) : null,
          prospectId: prospectId,
          ...(prospect.playStyle && { playStyle: prospect.playStyle }),
        },
        select: { id: true }
      });

      await tx.contract.create({
        data: {
          playerId: player.id,
          startDate: new Date(dto.contractStartDate),
          endDate: new Date(dto.contractEndDate),
          salary: dto.salary,
          ...(dto.signingBonus !== undefined && { signingBonus: dto.signingBonus }),
          status: "ACTIVE",
          managedById: dto.managedById ?? null,
        },
      });

      return tx.prospect.update({
        where: { id: prospectId },
        data: { status: "SIGNED", convertedPlayerId: player.id },
        select: PROSPECT_SELECT,
      });
    });
  }

  async recordMedicalResult(id: string, dto: ProspectMedicalResultDto) {
    const newStatus = dto.result === "pass" ? "CONTRACT_PENDING" : "ARCHIVED";
    return this.prisma.prospect.update({
      where: { id },
      data: {
        status: newStatus,
        ...(dto.medicalNotes !== undefined && { medicalNotes: dto.medicalNotes }),
      },
      select: PROSPECT_SELECT,
    });
  }

  addNegotiationLog(id: string, dto: CreateProspectNegotiationLogDto, createdById: string) {
    return this.prisma.prospectNegotiationLog.create({
      data: {
        prospectId: id,
        type: dto.type,
        note: dto.note,
        ...(dto.amount !== undefined && { amount: dto.amount }),
        createdById,
      },
    });
  }

  getNegotiationLogs(id: string) {
    return this.prisma.prospectNegotiationLog.findMany({
      where: { prospectId: id },
      orderBy: { createdAt: "asc" },
      include: { createdBy: { select: { id: true, username: true } } },
    });
  }

  addVideoEvaluation(
    prospectId: string,
    dto: CreateProspectVideoEvaluationDto,
    evaluatedById: string,
    result: VideoEvalResult,
  ) {
    return this.prisma.prospectVideoEvaluation.create({
      data: {
        prospectId,
        qualityPassed: dto.qualityPassed,
        identifiable: dto.identifiable,
        continuity: dto.continuity,
        jerseyNumber: dto.jerseyNumber ?? null,
        totalScore: dto.totalScore ?? null,
        scoreData: dto.scoreData ?? Prisma.DbNull,
        pipelineData: (dto.pipelineData ?? Prisma.DbNull) as unknown as Prisma.InputJsonValue,
        result,
        notes: dto.notes ?? null,
        evaluatedById,
      },
      include: { evaluatedBy: { select: { nickname: true } } },
    });
  }

  getVideoEvaluations(prospectId: string) {
    return this.prisma.prospectVideoEvaluation.findMany({
      where: { prospectId },
      orderBy: { evaluatedAt: 'desc' },
      include: { evaluatedBy: { select: { nickname: true } } },
    });
  }

  getLatestVideoEvaluation(prospectId: string) {
    return this.prisma.prospectVideoEvaluation.findFirst({
      where: { prospectId },
      orderBy: { evaluatedAt: 'desc' },
      select: { result: true },
    });
  }

  async updateVideoEvaluation(
    prospectId: string,
    evalId: number,
    dto: UpdateProspectVideoEvaluationDto,
    result: VideoEvalResult,
  ) {
    const existing = await this.prisma.prospectVideoEvaluation.findFirst({
      where: { id: evalId, prospectId },
      select: { id: true },
    });
    if (!existing) throw new AppError(404, 'VIDEO_EVAL_NOT_FOUND');
    return this.prisma.prospectVideoEvaluation.update({
      where: { id: evalId },
      data: {
        ...(dto.qualityPassed !== undefined && { qualityPassed: dto.qualityPassed }),
        ...(dto.identifiable !== undefined && { identifiable: dto.identifiable }),
        ...(dto.continuity !== undefined && { continuity: dto.continuity }),
        ...(dto.jerseyNumber !== undefined && { jerseyNumber: dto.jerseyNumber }),
        ...(dto.totalScore !== undefined && { totalScore: dto.totalScore }),
        ...(dto.scoreData !== undefined && { scoreData: dto.scoreData ?? Prisma.DbNull }),
        ...(dto.pipelineData !== undefined && { pipelineData: (dto.pipelineData ?? Prisma.DbNull) as unknown as Prisma.InputJsonValue }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        result,
      },
      include: { evaluatedBy: { select: { nickname: true } } },
    });
  }

  addEvaluationLog(
    prospectId: string,
    dto: CreateProspectEvaluationLogDto,
    evaluatedById: string,
  ) {
    return this.prisma.prospectEvaluationLog.create({
      data: {
        prospectId,
        type: dto.type as EvaluationLogType,
        note: dto.note,
        evaluatedById,
        ...(dto.evaluatedAt && { evaluatedAt: new Date(dto.evaluatedAt) }),
      },
      include: { evaluatedBy: { select: { nickname: true } } },
    });
  }

  getEvaluationLogs(prospectId: string) {
    return this.prisma.prospectEvaluationLog.findMany({
      where: { prospectId },
      orderBy: { evaluatedAt: 'desc' },
      include: { evaluatedBy: { select: { nickname: true } } },
    });
  }

  countByStatus(status: ProspectStatus) {
    return this.prisma.prospect.count({ where: { status } });
  }

  async checkAcquisitionGate(prospectId: string) {
    const prospect = await this.prisma.prospect.findUnique({
      where: { id: prospectId },
      select: { position: true, currentMarketValue: true },
    });
    if (!prospect) throw new AppError(404, 'PROSPECT_NOT_FOUND');

    if (!prospect.position) {
      return { positionMatched: false, budgetWarning: false, matchedSurveys: [] };
    }

    const items = await this.prisma.playerAcquisitionSurveyResponseItem.findMany({
      where: {
        position: prospect.position,
        response: { survey: { status: 'OPEN' } },
      },
      select: {
        position: true,
        budgetMin: true,
        budgetMax: true,
        response: { select: { surveyId: true } },
      },
    });

    const positionMatched = items.length > 0;
    let budgetWarning = false;
    if (positionMatched && prospect.currentMarketValue != null) {
      budgetWarning = items.every(
        (item) => item.budgetMax != null && prospect.currentMarketValue! > item.budgetMax,
      );
    }

    return {
      positionMatched,
      budgetWarning,
      matchedSurveys: items.map((item) => ({
        id: item.response.surveyId,
        position: item.position,
        budgetMin: item.budgetMin,
        budgetMax: item.budgetMax,
      })),
    };
  }

  async getForeignPlayerCount(): Promise<{ leagueLevel: import('../generated/enums').LeagueLevel | null; count: number }> {
    const [season, count] = await Promise.all([
      this.prisma.season.findFirst({ where: { status: 'ACTIVE' }, select: { leagueLevel: true } }),
      this.prisma.player.count({
        where: {
          status: 'ACTIVE',
          workPermitStatus: { not: 'NOT_REQUIRED' },
        },
      }),
    ]);
    return { leagueLevel: season?.leagueLevel ?? null, count };
  }
}
