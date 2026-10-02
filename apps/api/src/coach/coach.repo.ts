import { PrismaClient } from "../generated/client";
import { CoachStatus, CoachingRole } from "../generated/enums";
import { AppError } from "../lib/appError";
import {
  CreateHiringRoundDto, UpdateHiringRoundStatusDto,
  CreateCoachDto, UpdateCoachDto, TransitionCoachStatusDto,
  UpsertHeadCoachEvalDto, UpsertDefensiveEvalDto, UpsertAttackingEvalDto,
  UpsertGoalkeeperEvalDto, UpsertTier2EvalDto,
  CreateTutorAssignmentDto, UpdateTutorAssignmentDto,
} from "./dto/coach.dto";

const VALID_TRANSITIONS: Record<CoachStatus, CoachStatus[]> = {
  CANDIDATE:        ["SHORTLISTED", "ARCHIVED"],
  SHORTLISTED:      ["APPROVAL_PENDING", "ARCHIVED"],
  APPROVAL_PENDING: ["CONTRACTED", "ARCHIVED"],
  CONTRACTED:       ["RETIRED"],
  RETIRED:          [],
  ARCHIVED:         [],
};

const TIER1_ROLES: CoachingRole[] = ["HEAD_COACH", "DEFENSIVE_COACH", "ATTACKING_COACH", "GOALKEEPER_COACH"];

const ROUND_SELECT = {
  id: true, targetRole: true, fitScoreThreshold: true, status: true,
  deadline: true, budget: true, notes: true, result: true,
  createdAt: true,
  createdBy: { select: { nickname: true } },
  _count: { select: { coaches: true } },
} as const;

const COACH_SELECT = {
  id: true, name: true, nationality: true, coachingRole: true,
  status: true, shortlistSource: true, notes: true,
  isDeleted: true, packageLeadId: true, hiringRoundId: true, userId: true,
  createdAt: true, updatedAt: true,
  packageLead: { select: { id: true, name: true } },
  headCoachEval: true,
  defensiveCoachEval: true,
  attackingCoachEval: true,
  goalkeeperCoachEval: true,
  tier2Eval: true,
  tutorAssignments: {
    select: {
      id: true, type: true, sessionCount: true,
      languageProficiency: true, tacticalImplementationRate: true,
      externalName: true, externalContact: true,
      internalTutorId: true,
      internalTutor: { select: { nickname: true } },
      createdAt: true,
    },
  },
} as const;

export class CoachRepository {
  constructor(private prisma: PrismaClient) {}

  // ── HiringRound ────────────────────────────────────────────────────────────

  findAllRounds() {
    return this.prisma.coachHiringRound.findMany({
      select: ROUND_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  findRoundById(id: string) {
    return this.prisma.coachHiringRound.findUnique({ where: { id }, select: ROUND_SELECT });
  }

  createRound(dto: CreateHiringRoundDto) {
    return this.prisma.coachHiringRound.create({
      data: {
        targetRole: dto.targetRole,
        fitScoreThreshold: dto.fitScoreThreshold ?? 70,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        budget: dto.budget ?? null,
        notes: dto.notes ?? null,
        createdById: dto.createdById,
      },
      select: ROUND_SELECT,
    });
  }

  updateRoundStatus(id: string, dto: UpdateHiringRoundStatusDto) {
    return this.prisma.coachHiringRound.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.result !== undefined && { result: dto.result }),
      },
      select: ROUND_SELECT,
    });
  }

  // ── Coach ──────────────────────────────────────────────────────────────────

  findAll(filters: { roundId?: string; status?: CoachStatus }) {
    return this.prisma.coach.findMany({
      where: {
        isDeleted: false,
        ...(filters.roundId !== undefined && { hiringRoundId: filters.roundId }),
        ...(filters.status !== undefined && { status: filters.status }),
      },
      select: COACH_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  findById(id: string) {
    return this.prisma.coach.findFirst({ where: { id, isDeleted: false }, select: COACH_SELECT });
  }

  create(dto: CreateCoachDto) {
    return this.prisma.coach.create({
      data: {
        name: dto.name,
        nationality: dto.nationality ?? null,
        coachingRole: dto.coachingRole,
        notes: dto.notes ?? null,
        hiringRoundId: dto.hiringRoundId ?? null,
        packageLeadId: dto.packageLeadId ?? null,
      },
      select: COACH_SELECT,
    });
  }

  update(id: string, dto: UpdateCoachDto) {
    return this.prisma.coach.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.nationality !== undefined && { nationality: dto.nationality }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.packageLeadId !== undefined && { packageLeadId: dto.packageLeadId }),
      },
      select: COACH_SELECT,
    });
  }

  async updateStatus(id: string, dto: TransitionCoachStatusDto) {
    const coach = await this.prisma.coach.findUnique({
      where: { id },
      select: { status: true, coachingRole: true, hiringRound: { select: { createdById: true } } },
    });
    if (!coach) throw new AppError(404, "COACH_NOT_FOUND");
    const allowed = VALID_TRANSITIONS[coach.status];
    if (!allowed.includes(dto.status)) throw new AppError(409, "INVALID_STATUS_TRANSITION");

    if (dto.status === "CONTRACTED") {
      const duplicate = await this.prisma.coach.findFirst({
        where: { coachingRole: coach.coachingRole, status: "CONTRACTED", isDeleted: false, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) throw new AppError(409, "COACHING_ROLE_ALREADY_FILLED");
    }

    return {
      coach: await this.prisma.coach.update({
        where: { id },
        data: {
          status: dto.status,
          ...(dto.shortlistSource !== undefined && { shortlistSource: dto.shortlistSource }),
        },
        select: COACH_SELECT,
      }),
      roundCreatorId: coach.hiringRound?.createdById ?? null,
    };
  }

  // ── Evaluation ─────────────────────────────────────────────────────────────

  async upsertEvaluation(coachId: string, role: CoachingRole, dto: Record<string, unknown>) {
    const evalAt = dto["evaluatedAt"] ? new Date(dto["evaluatedAt"] as string) : new Date();
    const { evaluatedAt: _discarded, ...rest } = dto;
    const base = { ...rest, coachId, evaluatedAt: evalAt };

    if (role === "HEAD_COACH") {
      return this.prisma.headCoachEvaluation.upsert({
        where: { coachId },
        create: base as any,
        update: base as any,
      });
    }
    if (role === "DEFENSIVE_COACH") {
      return this.prisma.defensiveCoachEvaluation.upsert({
        where: { coachId },
        create: base as any,
        update: base as any,
      });
    }
    if (role === "ATTACKING_COACH") {
      return this.prisma.attackingCoachEvaluation.upsert({
        where: { coachId },
        create: base as any,
        update: base as any,
      });
    }
    if (role === "GOALKEEPER_COACH") {
      return this.prisma.goalkeeperCoachEvaluation.upsert({
        where: { coachId },
        create: base as any,
        update: base as any,
      });
    }
    // Tier 2
    return this.prisma.coachTier2Evaluation.upsert({
      where: { coachId },
      create: base as any,
      update: base as any,
    });
  }

  isTier1(role: CoachingRole): boolean {
    return (TIER1_ROLES as string[]).includes(role);
  }

  // ── TutorAssignment ────────────────────────────────────────────────────────

  findTutorById(id: string) {
    return this.prisma.coachTutorAssignment.findUnique({ where: { id } });
  }

  findTutors(coachId: string) {
    return this.prisma.coachTutorAssignment.findMany({
      where: { coachId },
      select: {
        id: true, type: true, sessionCount: true,
        languageProficiency: true, tacticalImplementationRate: true,
        externalName: true, externalContact: true,
        internalTutorId: true,
        internalTutor: { select: { nickname: true } },
        createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  createTutor(coachId: string, dto: CreateTutorAssignmentDto) {
    return this.prisma.coachTutorAssignment.create({
      data: {
        coachId,
        type: dto.type,
        internalTutorId: dto.internalTutorId ?? null,
        externalName: dto.externalName ?? null,
        externalContact: dto.externalContact ?? null,
        sessionCount: dto.sessionCount ?? 0,
        languageProficiency: dto.languageProficiency ?? null,
      },
    });
  }

  updateTutor(id: string, dto: UpdateTutorAssignmentDto) {
    return this.prisma.coachTutorAssignment.update({
      where: { id },
      data: {
        ...(dto.sessionCount !== undefined && { sessionCount: dto.sessionCount }),
        ...(dto.languageProficiency !== undefined && { languageProficiency: dto.languageProficiency }),
        ...(dto.tacticalImplementationRate !== undefined && { tacticalImplementationRate: dto.tacticalImplementationRate }),
      },
    });
  }
}
