import { ProspectRepository } from "./prospect.repo";
import { AppError } from "../lib/appError";
import { getForeignQuota } from "../lib/foreign-quota";
import { CreateProspectDto, UpdateProspectDto, TransitionProspectStatusDto, SignProspectDto, ProspectMedicalResultDto, CreateProspectNegotiationLogDto } from "./dto/prospect.dto";
import { ProspectStatus, VideoEvalResult } from "../generated/enums";
import { CreateProspectVideoEvaluationDto, CreateProspectEvaluationLogDto, UpdateProspectVideoEvaluationDto } from "./dto/video-evaluation.dto";
import { NotificationService } from "../notification/notification.service";
import { NotificationRepository } from "../notification/notification.repo";
import { getPrisma } from "../lib/prisma";

const notificationService = new NotificationService(new NotificationRepository(getPrisma()));

const SHORTLIST_CAPACITY = 5;

const NON_ACTIVE_STATUSES: ProspectStatus[] = ["LONGLIST", "PRE_SHORTLIST", "SHORTLIST", "SIGNED", "ARCHIVED"];

export function computeVideoEvalResult(
  qualityPassed: boolean,
  identifiable: boolean,
  continuity: boolean,
  totalScore: number | null | undefined,
): VideoEvalResult {
  if (!qualityPassed || !identifiable || !continuity) return 'FAIL';
  if (totalScore != null && totalScore >= 70) return 'PASS';
  return 'PENDING';
}

export class ProspectService {
  constructor(private repo: ProspectRepository) {}

  checkDuplicate(name: string, currentTeam?: string) {
    return this.repo.checkDuplicate(name, currentTeam);
  }

  async create(dto: CreateProspectDto, actor?: Express.User) {
    if (!dto.nationalityId) throw new AppError(400, "NATIONALITY_REQUIRED");
    const { squadPlayers } = await this.repo.checkDuplicate(dto.name);
    if (squadPlayers.length > 0) throw new AppError(409, "ALREADY_IN_SQUAD");

    let visaRequired: boolean | undefined = dto.visaRequired;
    if (visaRequired === undefined && actor?.clubId && dto.nationalityId) {
      const leagueCountryIds = await this.repo.getClubLeagueCountryIds(actor.clubId);
      visaRequired = leagueCountryIds.length > 0
        ? !leagueCountryIds.includes(dto.nationalityId)
        : undefined; // 리그 정보 없으면 미설정
    }

    return this.repo.create(dto, actor?.clubId ?? null, actor?.id, visaRequired);
  }

  getAll(status?: ProspectStatus, clubId?: string | null) {
    return this.repo.findAll(status, clubId);
  }

  async getById(id: string, clubId?: string | null) {
    const prospect = await this.repo.findById(id, clubId);
    if (!prospect) throw new AppError(404, "PROSPECT_NOT_FOUND");
    return prospect;
  }

  async update(id: string, dto: UpdateProspectDto, actorClubId?: string | null) {
    const prospect = await this.repo.findById(id, actorClubId);
    if (!prospect) throw new AppError(404, "PROSPECT_NOT_FOUND");
    return this.repo.update(id, dto);
  }

  async updateStatus(id: string, dto: TransitionProspectStatusDto, actorClubId?: string | null) {
    if (dto.status === "SIGNED") throw new AppError(400, "USE_SIGN_ENDPOINT");
    // 모든 경로에서 club 스코핑 보장
    const prospect = await this.getById(id, actorClubId);
    if (dto.status === "SHORTLIST") {
      if (prospect.status === "LONGLIST") throw new AppError(400, "MUST_GO_THROUGH_PRE_SHORTLIST");
      const count = await this.repo.countByStatus("SHORTLIST");
      if (count >= SHORTLIST_CAPACITY) throw new AppError(409, "SHORTLIST_FULL");
      const latest = await this.repo.getLatestVideoEvaluation(id);
      if (!latest || latest.result !== "PASS") throw new AppError(400, "VIDEO_EVAL_REQUIRED");
    }
    if (dto.status === "CONTRACT_PENDING") {
      if (prospect.visaRequired && prospect.visaEligibility === 'UNCERTAIN') {
        throw new AppError(400, 'VISA_ELIGIBILITY_UNCERTAIN');
      }
    }
    return this.repo.updateStatus(id, dto.status);
  }

  async getShortlistCapacity() {
    const current = await this.repo.countByStatus("SHORTLIST");
    return { capacity: SHORTLIST_CAPACITY, current };
  }

  async sign(id: string, dto: SignProspectDto, actorClubId?: string | null) {
    const prospect = await this.repo.findById(id, actorClubId);
    if (!prospect) throw new AppError(404, 'PROSPECT_NOT_FOUND');
    if (dto.workPermitStatus && dto.workPermitStatus !== 'NOT_REQUIRED') {
      const { leagueLevel, count } = await this.repo.getForeignPlayerCount();
      const limit = getForeignQuota(leagueLevel);
      if (count >= limit) throw new AppError(409, 'FOREIGN_QUOTA_EXCEEDED');
    }
    const result = await this.repo.sign(id, dto);
    void notificationService.notifyProspectSigned(result.name).catch(console.error);
    return result;
  }

  async recordMedicalResult(id: string, dto: ProspectMedicalResultDto, actorClubId?: string | null) {
    const prospect = await this.getById(id, actorClubId);
    if (prospect.status !== "MEDICAL_TEST") throw new AppError(409, "CANNOT_RECORD_MEDICAL_NON_PENDING");
    if (dto.result === 'pass' && prospect.visaRequired && prospect.visaEligibility === 'UNCERTAIN') {
      throw new AppError(400, 'VISA_ELIGIBILITY_UNCERTAIN');
    }
    return this.repo.recordMedicalResult(id, dto);
  }

  async addNegotiationLog(id: string, dto: CreateProspectNegotiationLogDto, createdById: string, actorClubId?: string | null) {
    const prospect = await this.getById(id, actorClubId);
    if (NON_ACTIVE_STATUSES.includes(prospect.status as ProspectStatus)) {
      throw new AppError(409, "CANNOT_LOG_NEGOTIATION_ON_NON_ACTIVE");
    }
    return this.repo.addNegotiationLog(id, dto, createdById);
  }

  getNegotiationLogs(id: string) {
    return this.repo.getNegotiationLogs(id);
  }

  async addVideoEvaluation(id: string, dto: CreateProspectVideoEvaluationDto, evaluatedById: string, actorClubId?: string | null) {
    await this.getById(id, actorClubId); // 존재 + club 스코핑 확인
    const result = computeVideoEvalResult(dto.qualityPassed, dto.identifiable, dto.continuity, dto.totalScore);
    return this.repo.addVideoEvaluation(id, dto, evaluatedById, result);
  }

  getVideoEvaluations(id: string) {
    return this.repo.getVideoEvaluations(id);
  }

  async updateVideoEvaluation(prospectId: string, evalId: number, dto: UpdateProspectVideoEvaluationDto, actorClubId?: string | null) {
    await this.getById(prospectId, actorClubId);
    const evaluations = await this.repo.getVideoEvaluations(prospectId);
    const current = evaluations.find((e) => e.id === evalId);
    if (!current) throw new AppError(404, 'VIDEO_EVAL_NOT_FOUND');
    const qualityPassed = dto.qualityPassed ?? current.qualityPassed;
    const identifiable = dto.identifiable ?? current.identifiable;
    const continuity = dto.continuity ?? current.continuity;
    const totalScore = dto.totalScore !== undefined ? dto.totalScore : current.totalScore;
    const result = computeVideoEvalResult(qualityPassed, identifiable, continuity, totalScore);
    return this.repo.updateVideoEvaluation(prospectId, evalId, dto, result);
  }

  async addEvaluationLog(id: string, dto: CreateProspectEvaluationLogDto, evaluatedById: string, actorClubId?: string | null) {
    await this.getById(id, actorClubId); // 존재 + club 스코핑 확인
    return this.repo.addEvaluationLog(id, dto, evaluatedById);
  }

  getEvaluationLogs(id: string) {
    return this.repo.getEvaluationLogs(id);
  }

  checkAcquisitionGate(id: string) {
    return this.repo.checkAcquisitionGate(id);
  }
}
