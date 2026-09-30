import cron from "node-cron";
import { getPrisma } from "../lib/prisma";
import { writeAuditLog } from "../lib/auditLog";

export function startRejectedApplicantRetentionJob() {
  // Run daily at 3:00 AM
  cron.schedule("0 3 * * *", async () => {
    const prisma = getPrisma();
    const now = new Date();

    try {
      const flagged = await (prisma.jobApplication as any).updateMany({
        where: {
          status: "REJECTED",
          dataRetentionDeadline: { lt: now },
          dataRetentionFlaggedAt: null,
        },
        data: {
          dataRetentionFlaggedAt: now,
        },
      });

      if (flagged.count > 0) {
        console.log(`[RejectedApplicantRetention] Flagged ${flagged.count} applications past 1-year retention`);
        void writeAuditLog({
          actorId: "",
          action: "APPLICANT_DATA_RETENTION_FLAGGED",
          detail: { count: flagged.count, date: now.toISOString() },
        }).catch(console.error);

        // Notify HR
        const hrUsers = await (prisma as any).user.findMany({
          where: { role: "FRONT_OFFICE", frontOfficeRole: "HR_MANAGER" },
          select: { id: true },
        }).catch(() => []);

        for (const user of hrUsers) {
          await (prisma as any).notification.create({
            data: {
              userId: user.id,
              type: "COMPLIANCE_DEADLINE_REMINDER",
              title: "불합격 지원자 데이터 보존 기한 초과",
              body: `${flagged.count}건의 불합격 지원자 데이터가 보존 기한(1년)을 초과했습니다. 삭제 처리가 필요합니다.`,
            } as any,
          }).catch(console.error);
        }
      }
    } catch (err) {
      console.error("[RejectedApplicantRetention] Job failed:", err);
    }
  });
}
