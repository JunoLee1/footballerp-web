import { AppError } from "../lib/appError";
import { writeAuditLog } from "../lib/auditLog";
import { NotificationRepository } from "../notification/notification.repo";
import { getPrisma } from "../lib/prisma";
import type { AttendanceAppealRepository } from "./attendance-appeal.repo";

export class AttendanceAppealService {
  constructor(
    private repo: AttendanceAppealRepository,
    private notificationRepo: NotificationRepository,
  ) {}

  async create(data: {
    trainingResultId: string;
    requestedStatus: string;
    reason: string;
    createdById: string;
  }) {
    const prisma = getPrisma();
    const result = await (prisma.trainingResult as any).findUnique({
      where: { id: data.trainingResultId },
      select: { id: true, attendance: true },
    });
    if (!result) throw new AppError(404, "TRAINING_RESULT_NOT_FOUND");

    // 이미 PENDING인 이의신청이 있으면 중복 방지
    const existing = await (prisma.attendanceAppeal as any).findFirst({
      where: { trainingResultId: data.trainingResultId, status: "PENDING" },
    });
    if (existing) throw new AppError(409, "APPEAL_ALREADY_PENDING");

    const appeal = await this.repo.create({
      trainingResultId: data.trainingResultId,
      originalStatus: result.attendance,
      requestedStatus: data.requestedStatus,
      reason: data.reason,
      createdById: data.createdById,
    });

    // HR_MANAGER 역할 유저에게 알림
    const hrManagers = await prisma.user.findMany({
      where: { role: "FRONT_OFFICE", frontOfficeRole: "HR_MANAGER" },
      select: { id: true },
    });
    await Promise.all(hrManagers.map((u) =>
      this.notificationRepo.create({
        userId: u.id,
        type: "SYSTEM",
        title: "출결 이의신청 접수",
        body: `출결 이의신청이 접수됐습니다. 검토가 필요합니다.`,
      })
    ));

    return appeal;
  }

  list(status?: string) {
    return this.repo.findAll(status);
  }

  async accept(id: number, reviewedById: string, reviewNote?: string) {
    const appeal = await this.repo.findById(id);
    if (!appeal) throw new AppError(404, "APPEAL_NOT_FOUND");
    if (appeal.status !== "PENDING") throw new AppError(409, "APPEAL_NOT_PENDING");

    const prisma = getPrisma();

    // TrainingResult 출결 상태 업데이트
    await (prisma.trainingResult as any).update({
      where: { id: appeal.trainingResultId },
      data: { attendance: appeal.requestedStatus },
    });

    await this.repo.updateStatus(id, "ACCEPTED", reviewedById, reviewNote);

    void writeAuditLog({
      actorId: reviewedById,
      action: "ATTENDANCE_APPEAL_ACCEPTED",
      targetId: id,
      detail: {
        trainingResultId: appeal.trainingResultId,
        from: appeal.originalStatus,
        to: appeal.requestedStatus,
      },
    }).catch(console.error);

    // 신청자에게 수락 알림
    void this.notificationRepo.create({
      userId: appeal.createdById,
      type: "SYSTEM",
      title: "이의신청 수락",
      body: `출결 이의신청이 수락됐습니다. 출결 상태가 변경됐습니다.`,
    }).catch(console.error);

    return this.repo.findById(id);
  }

  async reject(id: number, reviewedById: string, reviewNote?: string) {
    const appeal = await this.repo.findById(id);
    if (!appeal) throw new AppError(404, "APPEAL_NOT_FOUND");
    if (appeal.status !== "PENDING") throw new AppError(409, "APPEAL_NOT_PENDING");

    await this.repo.updateStatus(id, "REJECTED", reviewedById, reviewNote);

    void writeAuditLog({
      actorId: reviewedById,
      action: "ATTENDANCE_APPEAL_REJECTED",
      targetId: id,
      detail: { trainingResultId: appeal.trainingResultId, reason: reviewNote },
    }).catch(console.error);

    // 신청자에게 거절 알림
    void this.notificationRepo.create({
      userId: appeal.createdById,
      type: "SYSTEM",
      title: "이의신청 거절",
      body: `출결 이의신청이 거절됐습니다${reviewNote ? `: ${reviewNote}` : "."}`,
    }).catch(console.error);

    return this.repo.findById(id);
  }
}
