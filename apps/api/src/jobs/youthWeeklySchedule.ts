import cron from "node-cron";
import type { PrismaClient } from "../generated/client";
import { getPrisma } from "../lib/prisma";
import { NotificationRepository } from "../notification/notification.repo";

export async function collectWeeklyScheduleByGuardian(
  prisma: PrismaClient,
  weekStart: Date,
) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const sessions = await prisma.trainingSession.findMany({
    where: { date: { gte: weekStart, lt: weekEnd }, team: { type: "YOUTH" } },
    select: { id: true, date: true, sessionType: true, teamId: true, team: { select: { id: true, name: true } } },
  });

  const matches = await prisma.match.findMany({
    where: { date: { gte: weekStart, lt: weekEnd }, team: { type: "YOUTH" } },
    select: { id: true, date: true, homeTeamName: true, awayTeamName: true, team: { select: { id: true } } },
  });

  const youthTeamIds = [...new Set([
    ...sessions.map(s => s.team?.id ?? s.teamId).filter((id): id is string => id != null),
    ...matches.map(m => m.team?.id).filter((id): id is string => id != null),
  ])];

  if (youthTeamIds.length === 0) return [];

  const players = await prisma.player.findMany({
    where: { teamId: { in: youthTeamIds }, guardianId: { not: null } },
    select: { guardianId: true, teamId: true },
  });

  const guardianMap = new Map<string, { sessions: typeof sessions; matches: typeof matches }>();

  for (const player of players) {
    if (!player.guardianId) continue;
    if (!guardianMap.has(player.guardianId)) {
      guardianMap.set(player.guardianId, {
        sessions: sessions.filter(s => (s.team?.id ?? s.teamId) === player.teamId),
        matches: matches.filter(m => m.team?.id === player.teamId),
      });
    }
  }

  return Array.from(guardianMap.entries()).map(([guardianId, data]) => ({
    guardianId,
    ...data,
  }));
}

export function startYouthWeeklyScheduleJob() {
  cron.schedule("0 8 * * 1", async () => {
    const prisma = getPrisma();
    const notifRepo = new NotificationRepository(prisma);
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);

    const groups = await collectWeeklyScheduleByGuardian(prisma, monday).catch(() => []);

    for (const group of groups) {
      const sessionCount = group.sessions.length;
      const matchCount = group.matches.length;
      const body = [
        sessionCount > 0 ? `훈련 ${sessionCount}회` : null,
        matchCount > 0 ? `경기 ${matchCount}경기` : null,
      ].filter(Boolean).join(", ");

      if (!body) continue;

      void notifRepo
        .createForGuardian(group.guardianId, "YOUTH_WEEKLY_SCHEDULE", () => ({ title: "이번 주 일정 안내", body: `이번 주 예정된 일정: ${body}` }))
        .catch(console.error);
    }
  });
}
