import cron from "node-cron";
import { getPrisma } from "../lib/prisma";
import { NotificationRepository } from "../notification/notification.repo";

const WINDOWS = [
  { label: "60D" as const, days: 60, notifType: "WORK_PERMIT_EXPIRY_SOON_60D" as const },
  { label: "30D" as const, days: 30, notifType: "WORK_PERMIT_EXPIRY_SOON" as const },
];

export function startWorkPermitExpiryCheckJob() {
  cron.schedule("0 0 * * *", async () => {
    const prisma = getPrisma();
    const notifRepo = new NotificationRepository(prisma);
    const now = new Date();

    for (const win of WINDOWS) {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() + win.days);
      const expiring = await prisma.player.findMany({
        where: {
          workPermitStatus: "APPROVED",
          workPermitExpiry: { gte: now, lte: cutoff },
          workPermitAlerts: { none: { window: win.label } },
        },
        select: { id: true, playerName: true, workPermitExpiry: true },
      });

      for (const player of expiring) {
        const expiry = player.workPermitExpiry!;
        const daysLeft = Math.ceil(
          (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
        await prisma.workPermitAlertLog
          .create({ data: { playerId: player.id, window: win.label } })
          .catch(() => null);

        void notifRepo
          .createForStaff(
            win.notifType,
            (locale?: string) => ({
              title: locale === "ko" ? "노동허가 만료 임박" : "Work Permit Expiry Warning",
              body: locale === "ko"
                ? `${player.playerName} 선수의 노동허가가 ${daysLeft}일 후(${expiry.toLocaleDateString("ko-KR")}) 만료됩니다.`
                : `${player.playerName}'s work permit expires in ${daysLeft} day(s) (${expiry.toLocaleDateString("en-US")}).`,
            }),
            undefined,
          )
          .catch(console.error);
      }
    }
  });
}
