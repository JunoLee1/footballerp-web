import cron from "node-cron";
import { getPrisma } from "../lib/prisma";
import { NotificationRepository } from "../notification/notification.repo";

const MILESTONES = [
  { days: 90, type: "SPONSORSHIP_EXPIRY_90D" },
  { days: 60, type: "SPONSORSHIP_EXPIRY_60D" },
  { days: 30, type: "SPONSORSHIP_EXPIRY_30D" },
] as const;

export function startSponsorshipExpiryAlertJob() {
  cron.schedule("0 9 * * *", async () => {
    const prisma = getPrisma();
    const notifRepo = new NotificationRepository(prisma);
    const now = new Date();

    for (const { days, type } of MILESTONES) {
      const windowStart = new Date(now);
      windowStart.setDate(windowStart.getDate() + days - 3);
      const windowEnd = new Date(now);
      windowEnd.setDate(windowEnd.getDate() + days);

      const sponsorships = await prisma.sponsorship.findMany({
        where: {
          deletedAt: null,
          contractEnd: { gte: windowStart, lte: windowEnd },
        },
        select: { id: true, sponsorName: true, contractEnd: true },
      });

      for (const s of sponsorships) {
        const alreadySent = await prisma.notification.findFirst({
          where: { type, entityId: s.id },
        });
        if (alreadySent) continue;

        const endDate = s.contractEnd;
        const getMsg = (locale?: string) => ({
          title: locale === "ko" ? "스폰서십 계약 만료 임박" : "Sponsorship Expiring Soon",
          body:
            locale === "ko"
              ? `${s.sponsorName} 스폰서십 계약이 ${days}일 후(${endDate.toLocaleDateString("ko-KR")}) 만료됩니다.`
              : `${s.sponsorName} sponsorship expires in ${days} days (${endDate.toLocaleDateString("en-GB")}).`,
        });

        await Promise.all([
          notifRepo.createForGM(type, getMsg, s.id).catch(console.error),
          notifRepo.createForFinanceManager(type, getMsg, s.id).catch(console.error),
        ]);
      }
    }
  });
}
