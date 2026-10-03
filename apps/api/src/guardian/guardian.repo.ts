import type { PrismaClient } from "../generated/client";

export class GuardianRepository {
  constructor(private prisma: PrismaClient) {}

  findPlayerBySearch(studentCode: string, playerName: string) {
    return this.prisma.player.findFirst({
      where: { studentCode, playerName },
      select: {
        id: true,
        guardianId: true,
        playerName: true,
        dateOfBirthEncrypted: true,
        dateOfBirthIv: true,
      },
    });
  }

  findInviteCode(code: string) {
    return this.prisma.guardianInviteCode.findUnique({
      where: { code },
      select: { id: true, playerId: true, usedAt: true, expiresAt: true },
    });
  }

  findActiveInviteCode(playerId: string) {
    return this.prisma.guardianInviteCode.findFirst({
      where: { playerId, usedAt: null, expiresAt: { gt: new Date() } },
    });
  }

  createInviteCode(data: { code: string; playerId: string; issuedById: string; expiresAt: Date }) {
    return this.prisma.guardianInviteCode.create({ data });
  }

  linkGuardianToPlayer(playerId: string, guardianId: string) {
    return this.prisma.player.update({
      where: { id: playerId },
      data: { guardianId },
    });
  }

  markCodeUsed(id: number, usedById: string) {
    return this.prisma.guardianInviteCode.update({
      where: { id },
      data: { usedById, usedAt: new Date() },
    });
  }

  findChildByIdAndGuardian(playerId: string, guardianId: string) {
    return this.prisma.player.findFirst({
      where: { id: playerId, guardianId },
      select: { id: true },
    });
  }

  findChildById(playerId: string) {
    return this.prisma.player.findFirst({
      where: { id: playerId },
      select: {
        id: true,
        playerName: true,
        position: true,
        level: true,
        teamId: true,
        status: true,
        team: { select: { name: true } },
        user: { select: { isSuspended: true } },
      },
    });
  }

  findChildrenByGuardian(guardianId: string) {
    return this.prisma.player.findMany({
      where: { guardianId },
      select: {
        id: true,
        playerName: true,
        position: true,
        level: true,
        teamId: true,
        team: { select: { name: true } },
      },
    });
  }

  findDashboard(playerId: string, teamId: string | null, now: Date) {
    const weekLater = new Date(now);
    weekLater.setDate(weekLater.getDate() + 7);

    return Promise.all([
      // 자녀 기본 정보
      this.prisma.player.findUnique({
        where: { id: playerId },
        select: {
          id: true,
          playerName: true,
          position: true,
          level: true,
          team: { select: { name: true } },
        },
      }),
      // 다음 7일 경기 (자녀 소속 팀)
      teamId
        ? this.prisma.match.findMany({
            where: { teamId, date: { gte: now, lt: weekLater } },
            select: { id: true, date: true, homeTeamName: true, awayTeamName: true },
            take: 5,
          })
        : Promise.resolve([]),
      // 다음 7일 훈련
      this.prisma.trainingSession.findMany({
        where: {
          participants: { some: { playerId } },
          date: { gte: now, lt: weekLater },
        },
        select: { id: true, date: true, sessionType: true },
        take: 5,
      }),
      // 출결 현황
      this.prisma.trainingResult.groupBy({
        by: ["attendance"],
        where: { playerId },
        _count: { attendance: true },
      }),
      // 최신 성장평가
      this.prisma.growthEvaluation.findFirst({
        where: { playerId, isPublished: true },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      }),
      // 활성 발달계획
      this.prisma.playerDevelopmentPlan.findFirst({
        where: { playerId, status: "ACTIVE" },
      }),
      // 부상
      this.prisma.injury.findMany({
        where: { playerId },
        orderBy: { occurredAt: "desc" },
        select: { id: true, bodyPart: true, cause: true, status: true, occurredAt: true, expectedReturnDate: true },
      }),
      // 최근 경기 스탯
      this.prisma.playerMatchStats.findFirst({
        where: { playerId },
        orderBy: { match: { date: "desc" } },
      }),
      // 납부 현황
      this.prisma.academyFee.findMany({
        where: { playerId, status: { in: ["PENDING", "OVERDUE"] } },
        orderBy: { dueDate: "asc" },
      }),
    ]);
  }
}
