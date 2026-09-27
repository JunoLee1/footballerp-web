import { AdminRepository } from "./admin.repo";
import { AppError } from "../lib/appError";
import { maskEmail, maskUsername } from "../lib/maskPii";
import { cached } from "../lib/cache";
import { ListUsersQuery, UpdateUserRoleDto, PlayerWithoutAccountDto, SetDemoDto } from "./dto/admin.dto";

type AuditLogRecord = Awaited<ReturnType<AdminRepository["listAuditLogs"]>>[number];

function applyUserMask<T extends { email: string; username: string }>(user: T): T {
  return { ...user, email: maskEmail(user.email), username: maskUsername(user.username) };
}

export class AdminService {
  constructor(private repo: AdminRepository) {}

  async listUsers(filters: ListUsersQuery, isDemo: boolean = false, clubId?: number | null) {
    const key = `admin:users:${JSON.stringify(filters)}:${clubId ?? "null"}`;
    const users = await cached(key, 30, () => this.repo.listUsers(filters, clubId));
    if (!isDemo) return users;
    return users.map(applyUserMask);
  }

  async getPlayersWithoutAccounts(nameFilter?: string): Promise<PlayerWithoutAccountDto[]> {
    return this.repo.findPlayersWithoutAccounts(nameFilter);
  }

  async getUserById(id: number, isDemo: boolean = false) {
    const user = await this.repo.findById(id);
    if (!user) throw new AppError(404, "USER_NOT_FOUND");
    if (!isDemo) return user;
    return applyUserMask(user);
  }

  async updateUserRole(id: number, dto: UpdateUserRoleDto, requesterId: number, requesterRole?: string) {
    if (id === requesterId) throw new AppError(403, "CANNOT_MODIFY_SELF");
    if (dto.role === "SUPER_ADMIN" && requesterRole !== "SUPER_ADMIN") {
      throw new AppError(403, "ONLY_SUPER_ADMIN_CAN_GRANT_SUPER_ADMIN");
    }
    if (dto.role === "GM" && requesterRole !== "SUPER_ADMIN") {
      throw new AppError(403, "ONLY_SUPER_ADMIN_CAN_GRANT_GM");
    }

    const user = await this.repo.findById(id);
    if (!user) throw new AppError(404, "USER_NOT_FOUND");

    const coachingRole = dto.role === "COACHING_STAFF" ? (dto.coachingRole ?? null) : null;
    const frontOfficeRole = dto.role === "FRONT_OFFICE" ? (dto.frontOfficeRole ?? null) : null;

    return this.repo.updateRole(id, dto.role, coachingRole, frontOfficeRole, dto.clubId);
  }

  async deactivateUser(id: number, requesterId: number) {
    if (id === requesterId) throw new AppError(403, "CANNOT_MODIFY_SELF");

    const user = await this.repo.findById(id);
    if (!user) throw new AppError(404, "USER_NOT_FOUND");

    return this.repo.setDeleted(id, true);
  }

  async reactivateUser(id: number) {
    const user = await this.repo.findById(id);
    if (!user) throw new AppError(404, "USER_NOT_FOUND");

    return this.repo.setDeleted(id, false);
  }

  async deleteUser(id: number, requesterId: number) {
    if (id === requesterId) throw new AppError(403, "CANNOT_MODIFY_SELF");

    const user = await this.repo.findById(id);
    if (!user) throw new AppError(404, "USER_NOT_FOUND");

    const linked = await this.repo.getLinkedData(id);
    if (!linked) throw new AppError(404, "USER_NOT_FOUND");

    const hasLinkedData =
      linked.player !== null ||
      linked._count.managedContracts > 0 ||
      linked._count.createdSessions > 0 ||
      linked._count.approvedSessions > 0 ||
      linked._count.tacticalAnalyses > 0 ||
      linked._count.managedInjuries > 0 ||
      linked._count.agentPlayers > 0 ||
      linked._count.recallRequests > 0 ||
      linked._count.recallApprovals > 0;

    if (hasLinkedData) throw new AppError(409, "USER_HAS_LINKED_DATA");

    await this.repo.hardDelete(id);
  }

  async setDemoStatus(id: number, dto: SetDemoDto, requesterId: number) {
    if (id === requesterId) throw new AppError(403, "CANNOT_MODIFY_SELF");

    const user = await this.repo.findById(id);
    if (!user) throw new AppError(404, "USER_NOT_FOUND");

    return this.repo.setDemo(id, dto.isDemo);
  }

  async getAuditLogs(
    filters: { actorId?: number; action?: string; targetId?: string; from?: string; to?: string; page?: number; limit?: number },
    isDemo: boolean = false,
  ) {
    const key = `admin:audit-logs:${JSON.stringify(filters)}`;
    const { logs, total } = await cached(key, 15, async () => {
      const [l, t] = await Promise.all([
        this.repo.listAuditLogs(filters),
        this.repo.countAuditLogs(filters),
      ]);
      return { logs: l, total: t };
    });
    if (!isDemo) return { logs, total };
    return {
      logs: logs.map((log: AuditLogRecord) => ({
        ...log,
        actor: { ...log.actor, username: maskUsername(log.actor.username) },
      })),
      total,
    };
  }
}
