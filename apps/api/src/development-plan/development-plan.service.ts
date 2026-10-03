import { AppError } from "../lib/appError";
import { DevelopmentPlanRepository } from "./development-plan.repo";
import { NotificationRepository } from "../notification/notification.repo";
import { CreatePlanDto, UpdatePlanDto, PlanListQuery } from "./dto/development-plan.dto";

export class DevelopmentPlanService {
  constructor(
    private repo: DevelopmentPlanRepository,
    private notifRepo: NotificationRepository,
  ) {}

  getAll(query: PlanListQuery) {
    return this.repo.findAll(query);
  }

  async getById(id: string) {
    const plan = await this.repo.findById(id);
    if (!plan) throw new AppError(404, "PLAN_NOT_FOUND");
    return plan;
  }

  async create(dto: CreatePlanDto, coachId: string) {
    return this.repo.create({ ...dto, coachId });
  }

  async update(id: string, dto: UpdatePlanDto, requesterId: string, requesterRole: string, coachingRole?: string | null) {
    const plan = await this.repo.findById(id);
    if (!plan) throw new AppError(404, "PLAN_NOT_FOUND");
    if (plan.status !== "DRAFT") throw new AppError(409, "PLAN_NOT_EDITABLE");
    const isHeadCoach = requesterRole === "COACHING_STAFF" && coachingRole === "HEAD_COACH";
    const isAuthor = plan.coachId === requesterId;
    if (!isHeadCoach && !isAuthor) throw new AppError(403, "FORBIDDEN");
    return this.repo.update(id, dto);
  }

  async activate(id: string, requesterId: string, requesterRole: string, coachingRole?: string | null) {
    const plan = await this.repo.findById(id);
    if (!plan) throw new AppError(404, "PLAN_NOT_FOUND");
    if (plan.status !== "DRAFT") throw new AppError(409, "ALREADY_ACTIVATED");
    const isHeadCoach = requesterRole === "COACHING_STAFF" && coachingRole === "HEAD_COACH";
    const isAuthor = plan.coachId === requesterId;
    if (!isHeadCoach && !isAuthor) throw new AppError(403, "FORBIDDEN");
    const updated = await this.repo.updateStatus(id, "ACTIVE");
    const playerData = await this.repo.findPlayerUserId(plan.playerId);
    if (playerData?.userId) {
      void this.notifRepo
        .createForUser(
          playerData.userId,
          "PLAYER_DEVELOPMENT_PLAN_ACTIVATED",
          () => ({
            title: "발전 계획이 등록됐습니다",
            body: "코치가 이번 시즌 발전 계획을 작성하고 활성화했습니다.",
          }),
          id,
        )
        .catch(console.error);
    }
    return updated;
  }

  async review(id: string, requesterId: string, requesterRole: string, coachingRole?: string | null) {
    const plan = await this.repo.findById(id);
    if (!plan) throw new AppError(404, "PLAN_NOT_FOUND");
    if (plan.status !== "ACTIVE") throw new AppError(409, "PLAN_NOT_ACTIVE");
    const isHeadCoach = requesterRole === "COACHING_STAFF" && coachingRole === "HEAD_COACH";
    if (!isHeadCoach) throw new AppError(403, "FORBIDDEN");
    return this.repo.updateStatus(id, "REVIEWED", new Date());
  }
}
