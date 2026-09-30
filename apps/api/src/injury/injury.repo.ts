import { PrismaClient } from "../generated/client";
import { ExternalReportTarget, ExternalReportStatus } from "../generated/enums";
import { CreateInjuryDto, UpdateInjuryStatusDto, UpsertInjuryReportDto } from "./dto/injury.dto";

const n = <T>(v: T | undefined): T | null => v ?? null;

const INJURY_SELECT = {
  id: true,
  bodyPart: true,
  cause: true,
  status: true,
  occurredAt: true,
  expectedReturnDate: true,
  playerId: true,
  medicalStaffId: true,
  hospitalType: true,
  partnerId: true,
  customHospitalName: true,
  partner: { select: { id: true, name: true } },
} as const;

const INJURY_REPORT_SELECT = {
  id: true,
  injuryId: true,
  diagnosisName: true,
  treatmentContent: true,
  rehabStage: true,
  trainingReturnDate: true,
  matchAvailable: true,
  reinjuryRisk: true,
  medicalOpinion: true,
  securityLevel: true,
  allowedActivities: true,
  rehabLoadPercentage: true,
  createdById: true,
  updatedById: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, nickname: true } },
  updatedBy: { select: { id: true, nickname: true } },
  coachSignedAt: true,
  coachSignedById: true,
  coachSigner: { select: { id: true, nickname: true } },
  trainerSignedAt: true,
  trainerSignedById: true,
  trainerSigner: { select: { id: true, nickname: true } },
  medicalSignedAt: true,
  medicalSignedById: true,
  medicalSigner: { select: { id: true, nickname: true } },
} as const;

const GK_POSITIONS = ["GOALKEEPER"] as const;
const DEF_POSITIONS = ["CENTER_BACK", "LEFT_WING_BACK", "LEFT_FULL_BACK", "RIGHT_WING_BACK", "RIGHT_FULL_BACK"] as const;
const MID_POSITIONS = ["CENTRAL_DEFENSIVE_MIDFIELDER", "LEFT_DEFENSIVE_MIDFIELDER", "RIGHT_DEFENSIVE_MIDFIELDER", "CENTRAL_ATTACK_MIDFIELDER", "RIGHT_ATTACK_MIDFIELDER", "LEFT_ATTACK_MIDFIELDER"] as const;
const FWD_POSITIONS = ["STRIKER", "SHADOW_STRIKER", "WINGER"] as const;

export class InjuryRepository {
  constructor(private prisma: PrismaClient) {}

  getPlayerWithGuardian(playerId: string) {
    return this.prisma.player.findUnique({
      where: { id: playerId },
      select: {
        playerName: true,
        position: true,
        guardianId: true,
        guardian: { select: { email: true } },
      },
    });
  }

  async countAvailableByZone() {
    const [activeInjuries, activePlayers] = await Promise.all([
      this.prisma.injury.findMany({
        where: { status: { in: ["OCCURRED", "DIAGNOSED", "REHABILITATING"] } },
        select: { playerId: true },
      }),
      this.prisma.player.findMany({
        where: { status: "ACTIVE", level: { not: "YOUTH" } },
        select: { id: true, position: true },
      }),
    ]);
    const injuredIds = new Set(activeInjuries.map((i) => i.playerId));
    const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of activePlayers) {
      if (injuredIds.has(p.id)) continue;
      if ((GK_POSITIONS as readonly string[]).includes(p.position)) counts.GK++;
      else if ((DEF_POSITIONS as readonly string[]).includes(p.position)) counts.DEF++;
      else if ((MID_POSITIONS as readonly string[]).includes(p.position)) counts.MID++;
      else if ((FWD_POSITIONS as readonly string[]).includes(p.position)) counts.FWD++;
    }
    return counts;
  }

  findByPlayer(playerId: string) {
    return this.prisma.injury.findMany({
      where: { playerId },
      select: INJURY_SELECT,
      orderBy: { occurredAt: "desc" },
    });
  }

  findByPlayerWithReport(playerId: string) {
    return this.prisma.injury.findMany({
      where: { playerId },
      select: {
        ...INJURY_SELECT,
        injuryReport: { select: INJURY_REPORT_SELECT },
      },
      orderBy: { occurredAt: "desc" },
    });
  }

  findById(id: number) {
    return this.prisma.injury.findUnique({
      where: { id },
      select: {
        ...INJURY_SELECT,
        player: { select: { playerName: true, position: true, level: true } },
        medicalStaff: { select: { username: true } },
      },
    });
  }

  create(dto: CreateInjuryDto) {
    return this.prisma.injury.create({
      data: {
        playerId: dto.playerId,
        bodyPart: dto.bodyPart,
        cause: dto.cause,
        medicalStaffId: dto.medicalStaffId,
        expectedReturnDate: n(dto.expectedReturnDate ? new Date(dto.expectedReturnDate) : undefined),
        hospitalType: dto.hospitalType ?? null,
        partnerId: dto.partnerId ?? null,
        customHospitalName: dto.customHospitalName ?? null,
      },
      select: INJURY_SELECT,
    });
  }

  updatePriorWeeklyLoad(injuryId: number, load: number) {
    return this.prisma.injury.update({
      where: { id: injuryId },
      data: { priorWeeklyLoad: load },
    });
  }

  updateStatus(id: number, dto: UpdateInjuryStatusDto) {
    return this.prisma.injury.update({
      where: { id },
      data: {
        status: dto.status,
        expectedReturnDate: n(dto.expectedReturnDate ? new Date(dto.expectedReturnDate) : undefined),
      },
      select: INJURY_SELECT,
    });
  }

  findReport(injuryId: number) {
    return this.prisma.injuryReport.findUnique({
      where: { injuryId },
      select: INJURY_REPORT_SELECT,
    });
  }

  getReport(injuryId: number) {
    return this.prisma.injuryReport.findUnique({
      where: { injuryId },
      select: { rehabLoadPercentage: true, allowedActivities: true },
    });
  }

  upsertReport(injuryId: number, dto: UpsertInjuryReportDto, userId: string) {
    const data = {
      diagnosisName: dto.diagnosisName ?? null,
      treatmentContent: dto.treatmentContent ?? null,
      rehabStage: dto.rehabStage ?? null,
      trainingReturnDate: dto.trainingReturnDate ? new Date(dto.trainingReturnDate) : null,
      matchAvailable: dto.matchAvailable ?? null,
      reinjuryRisk: dto.reinjuryRisk ?? null,
      medicalOpinion: dto.medicalOpinion ?? null,
      securityLevel: dto.securityLevel ?? "INTERNAL",
      allowedActivities: dto.allowedActivities ?? null,
      rehabLoadPercentage: dto.rehabLoadPercentage ?? null,
    };
    return this.prisma.injuryReport.upsert({
      where: { injuryId },
      create: { ...data, injuryId, createdById: userId },
      update: { ...data, updatedById: userId },
      select: INJURY_REPORT_SELECT,
    });
  }

  signReport(injuryId: number, role: 'COACH' | 'TRAINER' | 'MEDICAL', userId: string) {
    const now = new Date();
    const data =
      role === 'COACH'
        ? { coachSignedAt: now, coachSignedById: userId }
        : role === 'TRAINER'
          ? { trainerSignedAt: now, trainerSignedById: userId }
          : { medicalSignedAt: now, medicalSignedById: userId };
    return this.prisma.injuryReport.update({
      where: { injuryId },
      data,
      select: INJURY_REPORT_SELECT,
    });
  }

  unsignReport(injuryId: number, role: 'COACH' | 'TRAINER' | 'MEDICAL') {
    const data =
      role === 'COACH'
        ? { coachSignedAt: null, coachSignedById: null }
        : role === 'TRAINER'
          ? { trainerSignedAt: null, trainerSignedById: null }
          : { medicalSignedAt: null, medicalSignedById: null };
    return this.prisma.injuryReport.update({
      where: { injuryId },
      data,
      select: INJURY_REPORT_SELECT,
    });
  }

  async getStats() {
    const [byBodyPart, byCause, withDates, activeCount] = await Promise.all([
      this.prisma.injury.groupBy({ by: ["bodyPart"], _count: { id: true } }),
      this.prisma.injury.groupBy({ by: ["cause"], _count: { id: true } }),
      this.prisma.injury.findMany({
        where: { expectedReturnDate: { not: null } },
        select: { occurredAt: true, expectedReturnDate: true },
      }),
      this.prisma.injury.count({ where: { status: { not: "RETURNED" } } }),
    ]);

    const avgRecoveryDays =
      withDates.length > 0
        ? Math.round(
            withDates.reduce(
              (sum, i) =>
                sum + (i.expectedReturnDate!.getTime() - i.occurredAt.getTime()) / 86_400_000,
              0,
            ) / withDates.length,
          )
        : null;

    return {
      activeCount,
      byBodyPart: Object.fromEntries(byBodyPart.map((b) => [b.bodyPart, b._count.id])),
      byCause: Object.fromEntries(byCause.map((b) => [b.cause, b._count.id])),
      avgRecoveryDays,
    };
  }

  findActive() {
    return this.prisma.injury.findMany({
      where: { status: { in: ["OCCURRED", "DIAGNOSED", "REHABILITATING"] } },
      select: { playerId: true, status: true },
    });
  }

  getAssessment(injuryId: number) {
    return this.prisma.injuryAssessment.findUnique({ where: { injuryId } });
  }

  upsertAssessment(
    injuryId: number,
    scores: {
      painLevel: number; hasSwelling: boolean; romScore: number;
      strengthScore: number; sprintScore: number; jumpScore: number;
      psychScore: number; positionRiskScore: number;
      medicalScore: number; functionalScore: number; modifierScore: number; totalScore: number;
    },
    assessedById: string
  ) {
    return this.prisma.injuryAssessment.upsert({
      where: { injuryId },
      create: { injuryId, assessedById, ...scores },
      update: { assessedById, assessedAt: new Date(), ...scores },
    });
  }

  async createExternalReports(
    injuryId: number,
    targets: { target: ExternalReportTarget; dueDate: Date }[],
    reportData: object
  ) {
    await this.prisma.externalReport.createMany({
      data: targets.map(({ target, dueDate }) => ({ injuryId, target, reportData, dueDate })),
      skipDuplicates: true,
    });
  }

  getExternalReports(injuryId: number) {
    return this.prisma.externalReport.findMany({ where: { injuryId }, orderBy: { createdAt: "asc" } });
  }

  findExternalReportById(id: number) {
    return this.prisma.externalReport.findUnique({ where: { id } });
  }

  updateExternalReportStatus(reportId: number, status: ExternalReportStatus, note?: string) {
    const data: { status: ExternalReportStatus; submittedAt?: Date; submittedNote?: string } = { status };
    if (status === "SUBMITTED") {
      data.submittedAt = new Date();
    }
    if (note !== undefined) {
      data.submittedNote = note;
    }
    return this.prisma.externalReport.update({ where: { id: reportId }, data });
  }
}
