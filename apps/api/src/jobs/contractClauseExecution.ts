import cron from "node-cron";
import { getPrisma } from "../lib/prisma";
import { writeAuditLog } from "../lib/auditLog";

export function startContractClauseExecutionJob() {
  cron.schedule("0 2 * * *", async () => {
    const prisma = getPrisma();
    const now = new Date();

    try {
      // Find ACTIVE contracts that have performance bonuses not yet triggered
      const contracts = await prisma.contract.findMany({
        where: { status: "ACTIVE" },
        select: {
          id: true,
          playerId: true,
          startDate: true,
          endDate: true,
          performanceBonuses: {
            where: { triggeredAt: null } as any,
            select: {
              id: true,
              amount: true,
              description: true,
              triggers: { select: { id: true, metric: true, threshold: true, period: true } },
            },
          },
        },
      });

      let triggered = 0;

      for (const contract of contracts) {
        for (const bonus of contract.performanceBonuses) {
          if (!bonus.triggers || bonus.triggers.length === 0) continue;

          // Evaluate triggers — simplified: check GOALS/ASSISTS/APPEARANCES via playerMatchStats
          for (const trigger of bonus.triggers) {
            const stats = await (prisma as any).playerMatchStats?.findMany?.({
              where: {
                playerId: contract.playerId,
                match: { date: { gte: contract.startDate, lte: now } },
              },
              select: { goals: true, assists: true, passesAttempted: true },
            }).catch(() => null);

            if (!stats) continue;

            let currentValue = 0;
            if (trigger.metric === "GOALS") {
              currentValue = stats.reduce((s: number, r: any) => s + (r.goals ?? 0), 0);
            } else if (trigger.metric === "ASSISTS") {
              currentValue = stats.reduce((s: number, r: any) => s + (r.assists ?? 0), 0);
            } else if (trigger.metric === "APPEARANCES") {
              currentValue = stats.filter((r: any) => (r.passesAttempted ?? 0) > 0).length;
            }

            if (currentValue >= trigger.threshold) {
              // Mark bonus as triggered
              await (prisma.performanceBonus as any).update({
                where: { id: bonus.id },
                data: { triggeredAt: now } as any,
              });

              void writeAuditLog({
                actorId: "",
                action: "PERFORMANCE_BONUS_TRIGGERED",
                targetId: contract.id,
                detail: { bonusId: bonus.id, metric: trigger.metric, currentValue, threshold: trigger.threshold },
              }).catch(console.error);

              // Notify GM
              const gmUser = await prisma.user.findFirst({
                where: { role: "FRONT_OFFICE", frontOfficeRole: "GM" } as any,
                select: { id: true },
              });
              if (gmUser) {
                await (prisma as any).notification.create({
                  data: {
                    userId: gmUser.id,
                    type: "PERFORMANCE_BONUS_ACHIEVED",
                    title: "성과 보너스 달성",
                    body: `계약 #${contract.id}: ${trigger.metric} ${currentValue}/${trigger.threshold} 달성 — 보너스 지급 확인이 필요합니다.`,
                    entityId: contract.id,
                  } as any,
                }).catch(console.error);
              }

              triggered++;
            }
          }
        }
      }

      console.log(`[ContractClauseExecution] ${triggered} bonuses triggered`);
    } catch (err) {
      console.error("[ContractClauseExecution] Job failed:", err);
    }
  });
}
