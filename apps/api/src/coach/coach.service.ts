import { CoachRepository } from "./coach.repo";
import { AppError } from "../lib/appError";
import {
  CreateHiringRoundDto, UpdateHiringRoundStatusDto,
  CreateCoachDto, UpdateCoachDto, TransitionCoachStatusDto,
  UpsertHeadCoachEvalDto, UpsertDefensiveEvalDto, UpsertAttackingEvalDto,
  UpsertGoalkeeperEvalDto, UpsertTier2EvalDto,
  CreateTutorAssignmentDto, UpdateTutorAssignmentDto,
} from "./dto/coach.dto";
import { CoachingRole, CoachStatus } from "../generated/enums";
import { NotificationService } from "../notification/notification.service";
import { NotificationRepository } from "../notification/notification.repo";
import { getPrisma } from "../lib/prisma";

const notificationService = new NotificationService(new NotificationRepository(getPrisma()));

export class CoachService {
  constructor(private repo: CoachRepository) {}

  // ── HiringRound ────────────────────────────────────────────────────────────

  getAllRounds() {
    return this.repo.findAllRounds();
  }

  async getRoundById(id: string) {
    const round = await this.repo.findRoundById(id);
    if (!round) throw new AppError(404, "HIRING_ROUND_NOT_FOUND");
    return round;
  }

  createRound(dto: CreateHiringRoundDto) {
    return this.repo.createRound(dto);
  }

  async updateRoundStatus(id: string, dto: UpdateHiringRoundStatusDto) {
    const round = await this.repo.findRoundById(id);
    if (!round) throw new AppError(404, "HIRING_ROUND_NOT_FOUND");
    return this.repo.updateRoundStatus(id, dto);
  }

  // ── Coach ──────────────────────────────────────────────────────────────────

  getAll(filters: { roundId?: string; status?: CoachStatus }) {
    return this.repo.findAll(filters);
  }

  async getById(id: string) {
    const coach = await this.repo.findById(id);
    if (!coach) throw new AppError(404, "COACH_NOT_FOUND");
    return coach;
  }

  create(dto: CreateCoachDto) {
    return this.repo.create(dto);
  }

  async update(id: string, dto: UpdateCoachDto) {
    const coach = await this.repo.findById(id);
    if (!coach) throw new AppError(404, "COACH_NOT_FOUND");
    return this.repo.update(id, dto);
  }

  async updateStatus(id: string, dto: TransitionCoachStatusDto) {
    const { coach, roundCreatorId } = await this.repo.updateStatus(id, dto);
    const name = coach.name;

    if (dto.status === "SHORTLISTED" && dto.shortlistSource === "MANUAL") {
      void notificationService.notifyCoachShortlisted(name, id).catch(console.error);
    } else if (dto.status === "APPROVAL_PENDING") {
      void notificationService.notifyCoachApprovalPending(name, id).catch(console.error);
    } else if (dto.status === "CONTRACTED") {
      void notificationService.notifyCoachContracted(name, id).catch(console.error);
    } else if (dto.status === "ARCHIVED" && roundCreatorId) {
      void notificationService.notifyCoachArchived(name, id, roundCreatorId).catch(console.error);
    }

    return coach;
  }

  // ── Evaluation ─────────────────────────────────────────────────────────────

  async upsertEvaluation(
    coachId: string,
    dto: UpsertHeadCoachEvalDto | UpsertDefensiveEvalDto | UpsertAttackingEvalDto | UpsertGoalkeeperEvalDto | UpsertTier2EvalDto,
  ) {
    const coach = await this.repo.findById(coachId);
    if (!coach) throw new AppError(404, "COACH_NOT_FOUND");
    return this.repo.upsertEvaluation(coachId, coach.coachingRole as CoachingRole, dto as Record<string, unknown>);
  }

  // ── TutorAssignment ────────────────────────────────────────────────────────

  async getTutors(coachId: string) {
    const coach = await this.repo.findById(coachId);
    if (!coach) throw new AppError(404, "COACH_NOT_FOUND");
    return this.repo.findTutors(coachId);
  }

  async createTutor(coachId: string, dto: CreateTutorAssignmentDto) {
    const coach = await this.repo.findById(coachId);
    if (!coach) throw new AppError(404, "COACH_NOT_FOUND");
    if (dto.type === "INTERNAL" && !dto.internalTutorId) {
      throw new AppError(400, "INTERNAL_TUTOR_ID_REQUIRED");
    }
    if (dto.type === "EXTERNAL" && !dto.externalName) {
      throw new AppError(400, "EXTERNAL_NAME_REQUIRED");
    }
    return this.repo.createTutor(coachId, dto);
  }

  async updateTutor(id: string, dto: UpdateTutorAssignmentDto) {
    const tutor = await this.repo.findTutorById(id);
    if (!tutor) throw new AppError(404, "TUTOR_ASSIGNMENT_NOT_FOUND");
    return this.repo.updateTutor(id, dto);
  }
}
