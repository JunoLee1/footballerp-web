import cron from "node-cron";
import { getPrisma } from "../lib/prisma";
import { EquipmentRepository } from "../equipment/equipment.repo";
import { NotificationRepository } from "../notification/notification.repo";

// #551: 매일 08:00 → dueDate 지난 미반납 대여 (status=ISSUED, returnedAt=null, dueDate<now)
// 대상: 신청자(borrower) + 승인자(approver) + 장비 관리자(EQUIPMENT_MANAGER)
// overdueNotifiedAt 세팅으로 중복 발송 방지.
export function startEquipmentOverdueReturnJob(schedule = "0 8 * * *") {
  cron.schedule(schedule, () => runEquipmentOverdueReturnJob().catch((err) => {
    console.error("[EquipmentOverdue] Job failed:", err);
  }));
}

type OverdueDeps = { repo: EquipmentRepository; notifRepo: NotificationRepository };

export async function runEquipmentOverdueReturnJob(now: Date = new Date(), deps?: OverdueDeps) {
  const prisma = deps ? undefined : getPrisma();
  const repo = deps?.repo ?? new EquipmentRepository(prisma!);
  const notifRepo = deps?.notifRepo ?? new NotificationRepository(prisma!);

  const loans = await repo.findLoansToNotifyOverdue(now);
  if (loans.length === 0) return { notified: 0 };

  const managers = await repo.findEquipmentManagers();
  const managerIds = managers.map((m) => m.id);

  for (const loan of loans) {
    const recipients = new Set<number>([loan.requestedById, ...managerIds]);
    if (loan.approvedById) recipients.add(loan.approvedById);

    const overdueDays = Math.max(1, Math.floor((now.getTime() - new Date(loan.dueDate).getTime()) / 86_400_000));
    const title = "장비 반납 기한 초과";
    const body = `${loan.equipmentItem.name} 반납이 ${overdueDays}일 초과됐습니다.`;

    await Promise.all(
      Array.from(recipients).map((userId) =>
        notifRepo.create({
          userId,
          type: "EQUIPMENT_RETURN_OVERDUE",
          title,
          body,
          entityId: loan.id,
        }).catch((err) => console.error("[EquipmentOverdue] notify failed:", err))
      )
    );
  }

  await repo.markOverdueNotified(loans.map((l) => l.id), now);
  console.log(`[EquipmentOverdue] ${loans.length} overdue loans flagged`);
  return { notified: loans.length };
}
