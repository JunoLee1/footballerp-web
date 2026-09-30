import { Role, CoachingRole, FrontOfficeRole } from "../generated/enums";
import { DashboardRepository } from "./dashboard.repo";
import { AppError } from "../lib/appError";

type UserCtx = {
  id: string;
  role: Role;
  coachingRole: CoachingRole | null | undefined;
  frontOfficeRole: FrontOfficeRole | null | undefined;
};

export class DashboardService {
  constructor(private repo: DashboardRepository) {}

  getYouthDevelopmentStats() {
    return this.repo.getYouthDevelopmentStats();
  }

  getAcademyFinanceStats(year: number, month: number) {
    return this.repo.getAcademyFinanceStats(year, month);
  }

  getStats(user: UserCtx, teamType?: "FIRST_TEAM" | "YOUTH") {
    switch (user.role) {
      case "ADMIN":
      case "SUPER_ADMIN":
        return this.repo.getAdminStats(teamType);
      case "GM":
        return this.repo.getGmStats();
      case "FRONT_OFFICE":
        return this.getFrontOfficeStats(user);
      case "COACHING_STAFF":
        return this.getCoachingStats(user);
      case "PLAYER":
        return this.repo.getPlayerStats(user.id);
      case "AGENT":
        return this.repo.getAgentStats(user.id);
      default:
        throw new AppError(403, "FORBIDDEN");
    }
  }

  private getFrontOfficeStats(user: UserCtx) {
    switch (user.frontOfficeRole) {
      case "TD":
        return this.repo.getTdStats();
      case "CONTRACT_MANAGER":
        return this.repo.getContractManagerStats();
      case "SCOUT":
        return this.repo.getScoutStats();
      case "EQUIPMENT_MANAGER":
        return this.repo.getEquipmentManagerStats();
      case "TACTICAL_ANALYST":
        return this.repo.getTacticalAnalystStats(user.id);
      case "HR_MANAGER":
      case "HR_STAFF":
        return this.repo.getHrManagerStats();
      case "FINANCE_MANAGER":
      case "FINANCE_STAFF":
        return this.repo.getFinanceManagerStats();
      case "ASSET_MANAGER":
      case "ASSET_STAFF":
        return this.repo.getAssetManagerStats();
      case "FACILITY_MANAGER":
      case "FACILITY_STAFF":
        return this.repo.getFacilityStats();
      default:
        throw new AppError(403, "FRONT_OFFICE_ROLE_NOT_ASSIGNED");
    }
  }

  async getCoachDashboard() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    // 오늘 또는 가장 최근 훈련 세션
    const todaySession = await this.repo.findTodayTrainingSession(todayStart, todayEnd);
    const recentSession =
      todaySession ??
      (await this.repo.findRecentTrainingSession(todayEnd));

    const absentPlayers = (recentSession?.results ?? []).map((r) => ({
      playerId: r.player.id,
      playerName: r.player.playerName,
      position: r.player.position,
      attendance: r.attendance,
      sessionDate: recentSession!.date,
    }));

    // 부상 선수 (복귀 임박 순)
    const injuries = await this.repo.findActiveInjuries();
    const injuredPlayers = injuries.map((inj) => ({
      playerId: inj.player.id,
      playerName: inj.player.playerName,
      position: inj.player.position,
      bodyPart: inj.bodyPart,
      cause: inj.cause,
      status: inj.status,
      expectedReturnDate: inj.expectedReturnDate,
      daysUntilReturn: inj.expectedReturnDate
        ? Math.ceil(
            (new Date(inj.expectedReturnDate).getTime() - now.getTime()) / 86400000
          )
        : null,
    }));

    // 다음 경기
    const nextMatch = await this.repo.findNextMatch(now);
    const daysUntilMatch = nextMatch
      ? Math.ceil((new Date(nextMatch.date).getTime() - now.getTime()) / 86400000)
      : null;

    return {
      sessionDate: recentSession?.date ?? null,
      isToday: !!todaySession,
      absentPlayers,
      injuredPlayers,
      nextMatch: nextMatch ? { ...nextMatch, daysUntilMatch } : null,
    };
  }

  private async getCoachingStats(user: UserCtx) {
    switch (user.coachingRole) {
      case "HEAD_COACH": {
        const [roleStats, medicalDashboard] = await Promise.all([
          this.repo.getHeadCoachStats(),
          this.repo.getMedicalDashboardStats(),
        ]);
        return { ...roleStats, medicalDashboard };
      }
      case "ASSISTANT_COACH":
        return this.repo.getHeadCoachStats();
      case "PHYSICAL_COACH":
        return this.repo.getPhysicalCoachStats(user.id);
      case "MEDICAL": {
        const [roleStats, medicalDashboard] = await Promise.all([
          this.repo.getMedicalStats(user.id),
          this.repo.getMedicalDashboardStats(),
        ]);
        return { ...roleStats, medicalDashboard };
      }
      case "MEDICAL_DIRECTOR": {
        const [roleStats, medicalDashboard] = await Promise.all([
          this.repo.getMedicalDirectorStats(user.id),
          this.repo.getMedicalDashboardStats(),
        ]);
        return { ...roleStats, medicalDashboard };
      }
      default:
        if (!user.coachingRole) throw new Error(`Missing coachingRole for COACHING_STAFF user ${user.id}`);
        return this.repo.getSpecialistCoachStats(user.coachingRole, user.id);
    }
  }
}
