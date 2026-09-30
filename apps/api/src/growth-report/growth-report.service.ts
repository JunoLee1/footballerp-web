import { AppError } from "../lib/appError";
import type { GrowthReportRepository } from "./growth-report.repo";
import type { NotificationRepository } from "../notification/notification.repo";
import type { DevelopmentPlanRepository } from "../development-plan/development-plan.repo";
import type { GuardianRepository } from "../guardian/guardian.repo";
import type { CreateGrowthEvaluationDto, AwardBadgeDto } from "./dto/growth-report.dto";

export class GrowthReportService {
  constructor(
    private repo: GrowthReportRepository,
    private notifRepo: NotificationRepository,
    private planRepo: DevelopmentPlanRepository,
    private guardianRepo: GuardianRepository,
  ) {}

  getEvaluationsByPlayer(playerId: string) {
    return this.repo.findEvaluationsByPlayer(playerId);
  }

  async getEvaluationsByPlayerForGuardian(playerId: string, guardianId: string) {
    const child = await this.guardianRepo.findChildByIdAndGuardian(playerId, guardianId);
    if (!child) throw new AppError(403, "FORBIDDEN");
    return this.repo.findPublishedEvaluationsByPlayer(playerId);
  }

  async getEvaluationById(id: number) {
    const ev = await this.repo.findEvaluationById(id);
    if (!ev) throw new AppError(404, "GROWTH_EVALUATION_NOT_FOUND");
    return ev;
  }

  async createEvaluation(dto: CreateGrowthEvaluationDto, coachId: string) {
    const existing = await this.repo.findEvaluationByPeriod(dto.playerId, dto.year, dto.month);
    if (existing) throw new AppError(409, "GROWTH_EVALUATION_ALREADY_EXISTS");
    const activePlan = await this.planRepo.findActiveByPlayer(dto.playerId);
    return this.repo.createEvaluation(dto, coachId, activePlan?.id);
  }

  async updateEvaluation(id: number, dto: Partial<CreateGrowthEvaluationDto>, coachId: string) {
    const ev = await this.repo.findEvaluationById(id);
    if (!ev) throw new AppError(404, "GROWTH_EVALUATION_NOT_FOUND");
    if (ev.coachId !== coachId) throw new AppError(403, "FORBIDDEN");
    if (ev.isPublished) throw new AppError(409, "ALREADY_PUBLISHED");
    return this.repo.updateEvaluation(id, dto);
  }

  async publishEvaluation(id: number) {
    const ev = await this.repo.findEvaluationById(id);
    if (!ev) throw new AppError(404, "GROWTH_EVALUATION_NOT_FOUND");
    if (ev.isPublished) throw new AppError(409, "ALREADY_PUBLISHED");

    const published = await this.repo.publishEvaluation(id);

    if (ev.player.guardianId) {
      void this.notifRepo
        .createForGuardian(
          ev.player.guardianId,
          "GROWTH_REPORT_PUBLISHED",
          () => ({
            title: "성장 보고서 발행",
            body: `${ev.player.playerName} 선수의 ${ev.year}년 ${ev.month}월 성장 보고서가 발행됐습니다.`,
          }),
          id,
        )
        .catch(console.error);
    }

    return published;
  }

  getPositionAverage(playerId: string) {
    return this.repo.getPositionAverage(playerId);
  }

  getBadgesByPlayer(playerId: string) {
    return this.repo.findBadgesByPlayer(playerId);
  }

  awardBadge(dto: AwardBadgeDto, coachId: string) {
    return this.repo.awardBadge(dto, coachId);
  }
}
