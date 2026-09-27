import { MedicalExpenseRepository } from "./medical-expense.repo";
import { isAdminLike } from "../lib/permissions";
import { NotificationRepository } from "../notification/notification.repo";
import { AppError } from "../lib/appError";
import { writeAuditLog } from "../lib/auditLog";
import { cached } from "../lib/cache";

export class MedicalExpenseService {
  constructor(
    private repo: MedicalExpenseRepository,
    private notifRepo: NotificationRepository,
  ) {}

  list(userId: number, role: string, coachingRole: string | null) {
    const scope = isAdminLike(role) || coachingRole === "MEDICAL_DIRECTOR" ? "all" : `u:${userId}`;
    const key = `medical-expenses:list:${scope}`;
    return cached(key, 30, () => {
      if (isAdminLike(role)) return this.repo.findAll(null);
      if (coachingRole === "MEDICAL_DIRECTOR") return this.repo.findAll(null);
      return this.repo.findAll(userId);
    });
  }

  async get(id: number) {
    const expense = await this.repo.findById(id);
    if (!expense) throw new AppError(404, "EXPENSE_NOT_FOUND");
    return expense;
  }

  async create(data: {
    submittedById: number;
    receiptDate: Date;
    costCategory: string;
    totalAmount: number;
    payerType: string;
    injuryId?: number;
    playerId?: string;
    description?: string;
    fileUrl?: string;
    fileName?: string;
  }) {
    let payerType = data.payerType;
    if (data.playerId) {
      const level = await this.repo.findPlayerLevel(data.playerId);
      if (level === "YOUTH") payerType = "CLUB";
    }
    return this.repo.create({ ...data, payerType });
  }

  async update(id: number, userId: number, data: {
    receiptDate?: Date;
    costCategory?: string;
    totalAmount?: number;
    payerType?: string;
    injuryId?: number | null;
    playerId?: string | null;
    description?: string;
    fileUrl?: string;
    fileName?: string;
  }) {
    const expense = await this.repo.findById(id);
    if (!expense) throw new AppError(404, "EXPENSE_NOT_FOUND");
    if (expense.submittedById !== userId) throw new AppError(403, "FORBIDDEN");
    if (expense.status !== "DRAFT" && expense.status !== "REJECTED") throw new AppError(409, "INVALID_STATUS");
    return this.repo.update(id, data);
  }

  async submit(id: number, userId: number) {
    const expense = await this.repo.findById(id);
    if (!expense) throw new AppError(404, "EXPENSE_NOT_FOUND");
    if (expense.submittedById !== userId) throw new AppError(403, "FORBIDDEN");
    if (expense.status !== "DRAFT" && expense.status !== "REJECTED") throw new AppError(409, "INVALID_STATUS");

    const submitted = await this.repo.submit(id);

    await this.notifRepo.createForMedicalDirector(
      "MEDICAL_EXPENSE_SUBMITTED",
      () => ({
        title: "의료비 결재 요청",
        body: "의료비 지출 건이 1차 결재를 기다리고 있습니다.",
      }),
      id,
    );

    return submitted;
  }

  async leaderApprove(id: number, reviewerId: number) {
    const expense = await this.repo.findById(id);
    if (!expense) throw new AppError(404, "EXPENSE_NOT_FOUND");
    if (expense.status !== "SUBMITTED") throw new AppError(409, "INVALID_STATUS");

    const approved = await this.repo.leaderApprove(id, reviewerId);

    await writeAuditLog({ actorId: reviewerId, action: "MEDICAL_EXPENSE_LEADER_APPROVED", targetId: id });

    await this.notifRepo.createForAdmin(
      "MEDICAL_EXPENSE_LEADER_APPROVED",
      () => ({
        title: "의료비 최종 결재 요청",
        body: "1차 승인된 의료비 지출 건이 최종 결재를 기다리고 있습니다.",
      }),
      id,
    );

    return approved;
  }

  async leaderReject(id: number, reviewerId: number, reason: string) {
    if (!reason?.trim()) throw new AppError(400, "REJECTION_REASON_REQUIRED");
    const expense = await this.repo.findById(id);
    if (!expense) throw new AppError(404, "EXPENSE_NOT_FOUND");
    if (expense.status !== "SUBMITTED") throw new AppError(409, "INVALID_STATUS");

    const rejected = await this.repo.leaderReject(id, reviewerId, reason.trim());

    await writeAuditLog({ actorId: reviewerId, action: "MEDICAL_EXPENSE_LEADER_REJECTED", targetId: id, detail: { reason: reason.trim() } });

    await this.notifRepo.create({
      userId: expense.submittedById,
      type: "MEDICAL_EXPENSE_REJECTED",
      title: "의료비 신청 반려",
      body: "제출하신 의료비 지출 건이 반려됐습니다. 내용을 수정 후 재상신해주세요.",
      entityId: id,
    });

    return rejected;
  }

  async approve(id: number, adminId: number) {
    const expense = await this.repo.findById(id);
    if (!expense) throw new AppError(404, "EXPENSE_NOT_FOUND");
    if (expense.status !== "LEADER_APPROVED") throw new AppError(409, "INVALID_STATUS");

    const approved = await this.repo.approve(id, adminId);

    await writeAuditLog({ actorId: adminId, action: "MEDICAL_EXPENSE_APPROVED", targetId: id });

    await this.notifRepo.create({
      userId: expense.submittedById,
      type: "MEDICAL_EXPENSE_APPROVED",
      title: "의료비 최종 승인",
      body: "제출하신 의료비 지출 건이 최종 승인됐습니다.",
      entityId: id,
    });

    return approved;
  }

  async reject(id: number, adminId: number, reason: string) {
    if (!reason?.trim()) throw new AppError(400, "REJECTION_REASON_REQUIRED");
    const expense = await this.repo.findById(id);
    if (!expense) throw new AppError(404, "EXPENSE_NOT_FOUND");
    if (expense.status !== "LEADER_APPROVED") throw new AppError(409, "INVALID_STATUS");

    const rejected = await this.repo.reject(id, adminId, reason.trim());

    await writeAuditLog({ actorId: adminId, action: "MEDICAL_EXPENSE_REJECTED", targetId: id, detail: { reason: reason.trim() } });

    await this.notifRepo.create({
      userId: expense.submittedById,
      type: "MEDICAL_EXPENSE_REJECTED",
      title: "의료비 최종 반려",
      body: "제출하신 의료비 지출 건이 반려됐습니다. 내용을 수정 후 재상신해주세요.",
      entityId: id,
    });

    return rejected;
  }
}
