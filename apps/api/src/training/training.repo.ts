import { PrismaClient } from "../generated/client";
import type { AttendanceStatus, SessionType } from "../generated/enums";
import { CreateSessionDto, AddContentDto, AddParticipantsDto, UpsertResultDto, SessionListQuery } from "./dto/training.dto";

const n = <T>(v: T | undefined): T | null => v ?? null;

export class TrainingRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(query: SessionListQuery, clubId?: string | null) {
    return this.prisma.trainingSession.findMany({
      where: {
        ...(query.seasonId && { seasonId: query.seasonId }),
        ...(clubId != null && { clubId }),
      },
      select: {
        id: true,
        date: true,
        goal: true,
        sessionType: true,
        isApproved: true,
        seasonId: true,
        createdById: true,
      },
      orderBy: { date: "desc" },
    });
  }

  findById(id: string, clubId?: string | null) {
    return this.prisma.trainingSession.findFirst({
      where: { id, ...(clubId != null && { clubId }) },
      select: {
        id: true,
        date: true,
        goal: true,
        sessionType: true,
        isApproved: true,
        seasonId: true,
        createdById: true,
        approvedById: true,
        contents: true,
        participants: { select: { playerId: true, player: { select: { playerName: true, position: true } } } },
        results: true,
      },
    });
  }

  create(dto: CreateSessionDto, createdById: string, clubId?: string | null) {
    return this.prisma.trainingSession.create({
      data: {
        date: new Date(dto.date),
        goal: dto.goal,
        sessionType: dto.sessionType,
        seasonId: dto.seasonId,
        createdById,
        ...(clubId != null && { clubId }),
        ...(dto.teamId ? { teamId: dto.teamId } : {}),
        ...(dto.contents && {
          contents: { create: dto.contents },
        }),
      },
      select: { id: true, date: true, goal: true, sessionType: true, isApproved: true, seasonId: true, teamId: true },
    });
  }

  approve(id: string, approvedById: string) {
    return this.prisma.trainingSession.update({
      where: { id },
      data: { isApproved: true, approvedById },
      select: { id: true, isApproved: true, approvedById: true },
    });
  }

  addContent(sessionId: string, dto: AddContentDto) {
    return this.prisma.trainingContent.create({
      data: { sessionId, phase: dto.phase, description: dto.description },
    });
  }

  addParticipants(sessionId: string, dto: AddParticipantsDto) {
    return this.prisma.trainingParticipant.createMany({
      data: dto.playerIds.map((playerId) => ({ sessionId, playerId })),
      skipDuplicates: true,
    });
  }

  async addAllActivePlayers(sessionId: string, teamId?: string | null) {
    const players = await this.prisma.player.findMany({
      where: {
        status: "ACTIVE",
        ...(teamId ? { teamId } : { team: { type: "FIRST_TEAM" } }),
      },
      select: {
        id: true,
        injuries: {
          where: { status: { notIn: ["RETURNED"] } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (players.length === 0) return;

    await this.prisma.trainingParticipant.createMany({
      data: players.map((p) => ({ sessionId, playerId: p.id })),
      skipDuplicates: true,
    });

    const injuredIds = players.filter((p) => p.injuries.length > 0).map((p) => p.id);
    if (injuredIds.length > 0) {
      await this.prisma.trainingResult.createMany({
        data: injuredIds.map((playerId) => ({
          sessionId,
          playerId,
          attendance: "ABSENT_AUTHORIZED" as const,
        })),
        skipDuplicates: true,
      });
    }
  }

  upsertResult(sessionId: string, dto: UpsertResultDto) {
    return this.prisma.trainingResult.upsert({
      where: { sessionId_playerId: { sessionId, playerId: dto.playerId } },
      create: {
        sessionId,
        playerId: dto.playerId,
        attendance: dto.attendance,
        feedback: n(dto.feedback),
        performanceScore: n(dto.performanceScore),
      },
      update: {
        attendance: dto.attendance,
        feedback: n(dto.feedback),
        performanceScore: n(dto.performanceScore),
      },
    });
  }

  async countUnexcusedAttendance(playerId: string): Promise<{ absences: number; lateCount: number }> {
    const rows = await this.prisma.trainingResult.groupBy({
      by: ["attendance"],
      where: { playerId, attendance: { in: ["ABSENT_UNAUTHORIZED", "LATE_UNAUTHORIZED"] } },
      _count: { attendance: true },
    });
    const absences = rows.find((r) => r.attendance === "ABSENT_UNAUTHORIZED")?._count.attendance ?? 0;
    const lateCount = rows.find((r) => r.attendance === "LATE_UNAUTHORIZED")?._count.attendance ?? 0;
    return { absences, lateCount };
  }

  findPlayerNameById(playerId: string) {
    return this.prisma.player.findUnique({ where: { id: playerId }, select: { playerName: true } });
  }

  async findResults(filters: {
    from?: string
    to?: string
    sessionType?: string
    playerId?: string
    nullOnly?: boolean
  }) {
    const where: Record<string, unknown> = {}

    // 유소년팀 세션 제외 — teamId가 없거나 FIRST_TEAM 세션만 포함
    where.session = {
      OR: [{ teamId: null }, { team: { type: 'FIRST_TEAM' } }],
    }

    if (filters.from || filters.to) {
      where.session = {
        ...(where.session as object),
        date: {
          ...(filters.from ? { gte: new Date(filters.from) } : {}),
          ...(filters.to ? { lte: new Date(filters.to + 'T23:59:59Z') } : {}),
        },
      }
    }

    if (filters.sessionType) {
      where.session = {
        ...(where.session as object),
        sessionType: filters.sessionType as SessionType,
      }
    }

    if (filters.playerId) {
      where.playerId = filters.playerId
    }

    if (filters.nullOnly) {
      where.attendance = null
    }

    const results = await this.prisma.trainingResult.findMany({
      where: where,
      include: {
        session: { select: { id: true, date: true, sessionType: true, goal: true } },
        player: { select: { id: true, playerName: true, position: true } },
      },
      orderBy: { session: { date: 'desc' } },
    })

    if (results.length === 0) return []

    const corrected = await this.prisma.auditLog.findMany({
      where: {
        action: 'ATTENDANCE_CORRECTED',
        targetId: { in: results.map(r => String(r.id)) },
      },
      select: { targetId: true },
      distinct: ['targetId'],
    })
    const correctedSet = new Set(corrected.map(c => c.targetId).filter((id): id is string => id !== null))

    return results.map(r => ({
      ...r,
      hasCorrectionHistory: correctedSet.has(String(r.id)),
    }))
  }

  findResultById(id: string) {
    return this.prisma.trainingResult.findUnique({
      where: { id },
      select: { id: true, attendance: true, playerId: true, sessionId: true, feedback: true, performanceScore: true },
    });
  }

  updateAttendance(id: string, attendance: string) {
    return this.prisma.trainingResult.update({
      where: { id },
      data: { attendance: attendance as AttendanceStatus },
    });
  }

  findPlayerUserId(playerId: string) {
    return this.prisma.player.findUnique({
      where: { id: playerId },
      select: { userId: true },
    });
  }

  findByIdWithTeam(id: string, clubId?: string | null) {
    return this.prisma.trainingSession.findFirst({
      where: { id, ...(clubId != null && { clubId }) },
      select: { id: true, teamId: true, date: true, team: { select: { id: true, type: true, name: true } } },
    });
  }

  updateSession(id: string, data: { date?: string; goal?: string }) {
    return this.prisma.trainingSession.update({
      where: { id },
      data: { ...(data.date && { date: new Date(data.date) }), ...(data.goal && { goal: data.goal }) },
      select: { id: true, date: true, goal: true, sessionType: true, isApproved: true },
    });
  }

  cancelSession(id: string) {
    return this.prisma.trainingSession.update({
      where: { id },
      data: { cancelledAt: new Date() },
    });
  }

  findGuardiansByTeam(teamId: string): Promise<string[]> {
    return this.prisma.player
      .findMany({
        where: { teamId, guardianId: { not: null } },
        select: { guardianId: true },
      })
      .then(rows => rows.map(r => r.guardianId!));
  }
}
