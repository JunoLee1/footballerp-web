import cron from "node-cron";
import { getPrisma } from "../lib/prisma";
import { NotificationRepository } from "../notification/notification.repo";

const MILESTONES = [
  { days: 90, type: "CONTRACT_EXPIRY_90D" },
  { days: 60, type: "CONTRACT_EXPIRY_60D" },
  { days: 30, type: "CONTRACT_EXPIRY_30D" },
] as const;

export function startContractExpiryAlertJob() {
  cron.schedule("0 0 * * *", async () => {
    const prisma = getPrisma();
    const notifRepo = new NotificationRepository(prisma);

    const now = new Date();

    for (const { days, type } of MILESTONES) {
      // catch-up 윈도우: 크론이 최대 3일 미실행돼도 누락 없도록 4일 윈도우 사용
      const windowStart = new Date(now);
      windowStart.setDate(windowStart.getDate() + days - 3);

      const windowEnd = new Date(now);
      windowEnd.setDate(windowEnd.getDate() + days);

      const contracts = await prisma.contract.findMany({
        where: {
          status: "ACTIVE",
          endDate: { gte: windowStart, lte: windowEnd },
        },
        select: {
          id: true,
          endDate: true,
          player: { select: { playerName: true } },
        },
      });

      for (const contract of contracts) {
        // 중복 방지: 이미 발송한 기록이 있으면 skip
        const alreadySent = await prisma.notification.findFirst({
          where: { type, entityId: contract.id },
        });
        if (alreadySent) continue;

        const { playerName } = contract.player;
        const endDate = contract.endDate;

        const getMsg = (locale?: string) => ({
          title: locale === "ko" ? "계약 만료 임박" : "Contract Expiring Soon",
          body:
            locale === "ko"
              ? `${playerName} 선수의 계약이 ${days}일 후(${endDate.toLocaleDateString("ko-KR")}) 만료됩니다.`
              : `${playerName}'s contract expires in ${days} days (${endDate.toLocaleDateString("en-GB")}).`,
        });

        await Promise.all([
          notifRepo
            .createForContractManager(type, getMsg, contract.id)
            .catch(console.error),
          notifRepo
            .createForGM(type, getMsg, contract.id)
            .catch(console.error),
        ]);
      }
    }
  });
}
