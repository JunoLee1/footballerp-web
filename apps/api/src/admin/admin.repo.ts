import { PrismaClient } from "../generated/client";
import { Role, CoachingRole, FrontOfficeRole } from "../generated/enums";
import { ListUsersQuery } from "./dto/admin.dto";

export const USER_SELECT = {
  id: true,
  email: true,
  username: true,
  nickname: true,
  role: true,
  coachingRole: true,
  frontOfficeRole: true,
  teamId: true,
  clubId: true,
  isDeleted: true,
  isOutOfOffice: true,
  isDemo: true,
  player: { select: { id: true, playerName: true } },
} as const;

const LINKED_COUNT_SELECT = {
  _count: {
    select: {
      managedContracts: true,
      createdSessions: true,
      approvedSessions: true,
      tacticalAnalyses: true,
      managedInjuries: true,
      agentPlayers: true,
      recallRequests: true,
      recallApprovals: true,
    },
  },
  player: { select: { id: true } },
} as const;

export class AdminRepository {
  constructor(private prisma: PrismaClient) {}

  listUsers(filters: ListUsersQuery, clubId?: string | null) {
    return this.prisma.user.findMany({
      where: {
        ...(clubId != null && { clubId }),
        ...(filters.username && {
          username: { contains: filters.username, mode: "insensitive" },
        }),
        ...(filters.role && { role: filters.role }),
        ...(filters.coachingRole && { coachingRole: filters.coachingRole }),
        ...(filters.frontOfficeRole && { frontOfficeRole: filters.frontOfficeRole }),
        ...(filters.isDeleted !== undefined && { isDeleted: filters.isDeleted }),
      },
      select: USER_SELECT,
      orderBy: { id: "asc" },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
  }

  updateRole(
    id: string,
    role: Role,
    coachingRole: CoachingRole | null,
    frontOfficeRole: FrontOfficeRole | null,
    clubId?: string | null,
  ) {
    return this.prisma.user.update({
      where: { id },
      data: { role, coachingRole, frontOfficeRole, ...(clubId !== undefined && { clubId }) },
      select: USER_SELECT,
    });
  }

  setDeleted(id: string, isDeleted: boolean) {
    return this.prisma.user.update({
      where: { id },
      data: { isDeleted },
      select: USER_SELECT,
    });
  }


  getLinkedData(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: LINKED_COUNT_SELECT,
    });
  }

  setDemo(id: string, isDemo: boolean) {
    return this.prisma.user.update({
      where: { id },
      data: { isDemo },
      select: USER_SELECT,
    });
  }

  async hardDelete(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
  }

  findPlayersWithoutAccounts(nameFilter?: string) {
    return this.prisma.player.findMany({
      where: {
        userId: null,
        ...(nameFilter && {
          playerName: { contains: nameFilter, mode: "insensitive" },
        }),
      },
      select: { id: true, playerName: true, status: true, position: true },
      orderBy: { playerName: "asc" },
    });
  }

  listAuditLogs(filters: {
    actorId?: string;
    action?: string;
    targetId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const limit = filters.limit ?? 50;
    const page = filters.page ?? 1;
    const where: Record<string, unknown> = {};
    if (filters.actorId) where["actorId"] = filters.actorId;
    if (filters.action) where["action"] = filters.action;
    if (filters.targetId !== undefined) where["targetId"] = filters.targetId;
    if (filters.from || filters.to) {
      const createdAt: Record<string, Date> = {};
      if (filters.from) createdAt["gte"] = new Date(filters.from);
      if (filters.to) createdAt["lte"] = new Date(filters.to + "T23:59:59");
      where["createdAt"] = createdAt;
    }
    return this.prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        action: true,
        targetId: true,
        detail: true,
        createdAt: true,
        actor: { select: { id: true, username: true, nickname: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  countAuditLogs(filters: { actorId?: string; action?: string; targetId?: string; from?: string; to?: string }) {
    const where: Record<string, unknown> = {};
    if (filters.actorId) where["actorId"] = filters.actorId;
    if (filters.action) where["action"] = filters.action;
    if (filters.targetId !== undefined) where["targetId"] = filters.targetId;
    if (filters.from || filters.to) {
      const createdAt: Record<string, Date> = {};
      if (filters.from) createdAt["gte"] = new Date(filters.from);
      if (filters.to) createdAt["lte"] = new Date(filters.to + "T23:59:59");
      where["createdAt"] = createdAt;
    }
    return this.prisma.auditLog.count({ where });
  }
}
