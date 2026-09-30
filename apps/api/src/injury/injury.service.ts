import { InjuryRepository } from "./injury.repo";
import { AppError } from "../lib/appError";
import { CreateInjuryDto, UpdateInjuryStatusDto, UpsertInjuryReportDto, UpsertAssessmentDto } from "./dto/injury.dto";
import { calculateTotalScore, SCORE_THRESHOLD } from "./injury.score";
import { ExternalReportTarget, ExternalReportStatus } from "../generated/enums";
import { NotificationRepository } from "../notification/notification.repo";
import { getIO } from "../lib/io";
import { writeAuditLog } from "../lib/auditLog";
import { getPrisma } from "../lib/prisma";
import { cached } from "../lib/cache";

const VALID_INJURY_TRANSITIONS: Record<string, string[]> = {
  OCCURRED: ["DIAGNOSED"],
  DIAGNOSED: ["REHABILITATING", "OCCURRED"],
  REHABILITATING: ["READY_TO_RETURN", "DIAGNOSED"],
  READY_TO_RETURN: ["RETURNED", "REHABILITATING"],
  RETURNED: [],
};

const DUE_DAYS: Record<ExternalReportTarget, number> = {
  EDUCATION_OFFICE: 3,
  SCHOOL_SAFETY: 3,
  INSURANCE: 5,
  LEAGUE: 7,
  FEDERATION: 7,
  POLICE: 1,
  CHILD_PROTECTION_AGENCY: 1,
  FOOTBALL_ASSOCIATION: 3,
};

export class InjuryService {
  constructor(
    private repo: InjuryRepository,
    private notifRepo: NotificationRepository,
    private loadRepo?: { getWeeklyLoadTotal: (playerId: string, weekStart: Date) => Promise<number> },
  ) {}

  getByPlayer(playerId: string) {
    return this.repo.findByPlayer(playerId);
  }

  async getById(id: string) {
    const injury = await this.repo.findById(id);
    if (!injury) throw new AppError(404, "INJURY_NOT_FOUND");
    return injury;
  }

  // #584: PLAYER 본인 부상이면 true — 없거나 unlinked player 면 false.
  async isSelfOwnedInjury(injuryId: string, userId: string): Promise<boolean> {
    const row = await this.repo.findPlayerUserIdByInjury(injuryId);
    return row?.player?.userId === userId;
  }

  async isSelfOwnedPlayer(playerId: string, userId: string): Promise<boolean> {
    const row = await this.repo.findPlayerUserId(playerId);
    return row?.userId === userId;
  }

  async createInjury(dto: CreateInjuryDto) {
    const result = await this.repo.create(dto);
    // BH4: 부상 시점 직전 7일 훈련 부하 스냅샷 (fire-and-forget)
    if (this.loadRepo) {
      const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      void this.loadRepo.getWeeklyLoadTotal(dto.playerId, weekStart)
        .then(load => { if (load > 0) return this.repo.updatePriorWeeklyLoad(result.id, load); })
        .catch(console.error);
    }
    try {
      const player = await this.repo.getPlayerWithGuardian(dto.playerId);
      const playerName = player?.playerName ?? "선수";
      const title = "부상 발생";
      const body = `${playerName} 선수에게 부상이 발생했습니다. 부상 기록을 확인하세요.`;
      await this.notifRepo.createForCoachingStaff("INJURY_OCCURRED", () => ({ title, body }), result.id);
      getIO().to("staff-room").emit("notification:injury", {
        type: "INJURY_OCCURRED", title, body, createdAt: new Date().toISOString(),
      });

      if (player?.guardianId) {
        void this.notifRepo
          .createForGuardian(
            player.guardianId,
            "GUARDIAN_CHILD_INJURY",
            () => ({ title: "자녀 부상 알림", body: `${playerName} 선수에게 부상이 발생했습니다.` }),
            result.id,
          )
          .catch(console.error);

        if (player.guardian?.email) {
          const { sendGuardianInjuryEmail } = await import("../lib/email");
          void sendGuardianInjuryEmail(
            player.guardian.email,
            playerName,
            dto.cause,
          ).catch(console.error);
        }
      }

      await this.checkAndNotifySquadDepth(result.id);
    } catch {
      // 알림 실패는 치명적이지 않음
    }
    return result;
  }

  async updateStatus(
    id: string,
    dto: UpdateInjuryStatusDto,
    _userId?: number,
    _requester?: { role: string; coachingRole: string | null },
  ) {
    const injury = await this.repo.findById(id);
    if (!injury) throw new AppError(404, "INJURY_NOT_FOUND");
    const allowed = VALID_INJURY_TRANSITIONS[injury.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new AppError(400, "INVALID_INJURY_STATUS_TRANSITION");
    }
    const result = await this.repo.updateStatus(id, dto);
    try {
      const playerName = injury.player?.playerName ?? "선수";
      if (dto.status === "REHABILITATING") {
        const title = "재활 훈련 시작";
        const body = `${playerName} 선수가 재활 훈련을 시작합니다. 훈련 부하 계획을 조정해주세요.`;
        await Promise.all([
          this.notifRepo.createForPhysicalCoach("INJURY_REHABILITATING_STARTED", () => ({ title, body }), id).catch(console.error),
          this.notifRepo.createForHeadCoach("INJURY_REHABILITATING_STARTED", () => ({ title, body }), id).catch(console.error),
        ]);
      } else if (dto.status === "READY_TO_RETURN") {
        const title = "선수 복귀 준비 완료";
        const body = `${playerName} 선수가 복귀 준비 단계에 들어섰습니다. 최종 복귀 여부를 검토하세요.`;
        await this.notifRepo.createForCoachingStaff("INJURY_READY_TO_RETURN", () => ({ title, body }), id);
        getIO().to("staff-room").emit("notification:injury", {
          type: "INJURY_READY_TO_RETURN", title, body, createdAt: new Date().toISOString(),
        });
      } else if (dto.status === "RETURNED") {
        const title = "선수 부상 복귀";
        const body = `${playerName} 선수가 부상에서 복귀하여 훈련에 합류했습니다.`;
        await this.notifRepo.createForCoachingStaff("INJURY_RETURNED", () => ({ title, body }), id);
        await this.notifRepo.createForMedicalStaff("INJURY_RETURNED", () => ({ title, body }), id);
        getIO().to("staff-room").emit("notification:injury", {
          type: "INJURY_RETURNED", title, body, createdAt: new Date().toISOString(),
        });
        await this.checkAndNotifySquadDepth(id);
      }
    } catch {
      // 알림 실패는 치명적이지 않음
    }
    return result;
  }

  private async checkAndNotifySquadDepth(entityId: number | string) {
    const ZONE_MIN = { GK: 2, DEF: 4, MID: 3, FWD: 2 } as const;
    const ZONE_LABEL = { GK: "골키퍼", DEF: "수비", MID: "미드필더", FWD: "공격" } as const;
    const counts = await this.repo.countAvailableByZone();
    const shortZones = (["GK", "DEF", "MID", "FWD"] as const).filter(
      (z) => counts[z] < ZONE_MIN[z],
    );
    if (shortZones.length === 0) return;
    const lines = shortZones.map(
      (z) => `${ZONE_LABEL[z]} ${counts[z]}명 (최소 ${ZONE_MIN[z]}명)`,
    );
    const title = "스쿼드 가용 인원 부족";
    const body = `가용 인원이 부족한 포지션이 있습니다 — ${lines.join(", ")}. 영입 또는 포지션 조정을 검토하세요.`;
    await this.notifRepo.createForHeadCoach("SQUAD_DEPTH_LOW", () => ({ title, body }), entityId);
    getIO().to("staff-room").emit("notification:squad-depth", {
      type: "SQUAD_DEPTH_LOW", title, body, createdAt: new Date().toISOString(),
    });
  }

  private isMedicalRole(role: string, coachingRole: string | null): boolean {
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') return true;
    return role === 'COACHING_STAFF' &&
      (coachingRole === 'MEDICAL' || coachingRole === 'MEDICAL_DIRECTOR');
  }

  async getReport(injuryId: string, requester: { role: string; coachingRole: string | null }) {
    const injury = await this.repo.findById(injuryId);
    if (!injury) throw new AppError(404, "INJURY_NOT_FOUND");
    const report = await this.repo.findReport(injuryId);
    if (!report) return null;
    if (report.securityLevel === 'PRIVATE' && !this.isMedicalRole(requester.role, requester.coachingRole)) {
      throw new AppError(403, "FORBIDDEN");
    }
    return report;
  }

  async saveReport(
    injuryId: string,
    dto: UpsertInjuryReportDto,
    userId: string,
    requester: { role: string; coachingRole: string | null },
  ) {
    const injury = await this.repo.findById(injuryId);
    if (!injury) throw new AppError(404, "INJURY_NOT_FOUND");

    const { allowedActivities: _omit, ...dtoWithoutActivities } = dto;
    const safeDto: UpsertInjuryReportDto = this.isMedicalRole(requester.role, requester.coachingRole)
      ? dto
      : dtoWithoutActivities as UpsertInjuryReportDto;

    // BH7: capture previous values for change detection
    const existing = await this.repo.getReport(injuryId);

    const report = await this.repo.upsertReport(injuryId, safeDto, userId);

    // BH7: notify on rehabLoadPercentage or allowedActivities change
    const rehabChanged =
      (safeDto.rehabLoadPercentage !== undefined && safeDto.rehabLoadPercentage !== existing?.rehabLoadPercentage) ||
      (safeDto.allowedActivities !== undefined && safeDto.allowedActivities !== existing?.allowedActivities);

    if (rehabChanged) {
      const name = injury.player?.playerName ?? String(injuryId);
      const pct = report.rehabLoadPercentage;
      const title = "재활 훈련 조건 변경";
      const body = `${name} 선수의 재활 부하 허용치가 ${pct != null ? pct + "%" : "미설정"}로 업데이트됐습니다.`;
      await Promise.all([
        this.notifRepo.createForPhysicalCoach("INJURY_REPORT_UPDATED", () => ({ title, body }), injuryId).catch(console.error),
        this.notifRepo.createForHeadCoach("INJURY_REPORT_UPDATED", () => ({ title, body }), injuryId).catch(console.error),
      ]);
    }

    const warning =
      report.matchAvailable === true && !report.medicalSignedAt
        ? "MATCH_AVAILABLE_WITHOUT_MEDICAL_CLEARANCE"
        : undefined;

    return warning ? { ...report, _warning: warning } : report;
  }

  async signReport(injuryId: string, role: 'COACH' | 'TRAINER' | 'MEDICAL', userId: string, signerTeamId?: number | null) {
    const report = await this.repo.findReport(injuryId);
    if (!report) throw new AppError(404, "INJURY_REPORT_NOT_FOUND");
    // SH20: 부상 선수의 팀 == 서명자의 팀 검증 (SUPER_ADMIN은 signerTeamId가 undefined로 전달되어 스킵)
    if (signerTeamId !== undefined) {
      const injury = await this.repo.findById(injuryId);
      if (!injury) throw new AppError(404, "INJURY_NOT_FOUND");
      const player = await getPrisma().player.findUnique({
        where: { id: injury.playerId },
        select: { teamId: true },
      });
      if (player && player.teamId !== signerTeamId) throw new AppError(403, "FORBIDDEN");
    }
    return this.repo.signReport(injuryId, role, userId);
  }

  async unsignReport(injuryId: string, role: 'COACH' | 'TRAINER' | 'MEDICAL') {
    const report = await this.repo.findReport(injuryId);
    if (!report) throw new AppError(404, "INJURY_REPORT_NOT_FOUND");
    return this.repo.unsignReport(injuryId, role);
  }

  getStats() {
    return this.repo.getStats();
  }

  getActive() {
    return cached("injuries:active", 30, () => this.repo.findActive());
  }

  getAssessment(injuryId: string) {
    return this.repo.getAssessment(injuryId);
  }

  async processAssessment(injuryId: string, dto: UpsertAssessmentDto, assessedById: string) {
    const scores = calculateTotalScore(dto);

    const assessment = await this.repo.upsertAssessment(injuryId, { ...dto, ...scores }, assessedById);

    if (scores.totalScore >= SCORE_THRESHOLD) {
      const injury = await this.repo.findById(injuryId);
      if (!injury) throw new AppError(404, "INJURY_NOT_FOUND");

      const isYouth = injury.player.level === "YOUTH";
      const targets: ExternalReportTarget[] = isYouth
        ? [ExternalReportTarget.EDUCATION_OFFICE, ExternalReportTarget.SCHOOL_SAFETY]
        : [ExternalReportTarget.LEAGUE, ExternalReportTarget.FEDERATION, ExternalReportTarget.INSURANCE];

      const reportData = {
        playerName: injury.player.playerName,
        bodyPart: injury.bodyPart,
        cause: injury.cause,
        occurredAt: injury.occurredAt,
        totalScore: scores.totalScore,
        generatedAt: new Date().toISOString(),
      };

      const now = new Date();
      const targetsWithDue = targets.map((target) => {
        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + DUE_DAYS[target]);
        return { target, dueDate };
      });
      await this.repo.createExternalReports(injuryId, targetsWithDue, reportData);

      // RA7: audit consent log for external medical data transmission
      void writeAuditLog({
        actorId: assessedById,
        action: "MEDICAL_DATA_TRANSMITTED_EXTERNALLY",
        targetId: injuryId,
        detail: { targets: targets, playerName: reportData.playerName, triggeredByScore: scores.totalScore },
      }).catch(console.error);

      try {
        await this.notifRepo.createForMedicalDirector(
          "EXTERNAL_REPORT_CREATED",
          () => ({
            title: "외부 의무보고서 생성됨",
            body: `부상 #${injuryId}에 대해 외부 의무보고서 ${targets.length}건이 생성됐습니다. 제출 기한을 확인하세요.`,
          }),
          injuryId,
        );
      } catch {
        // 알림 실패는 치명적이지 않음
      }
    }

    return { assessment, triggeredReports: scores.totalScore >= SCORE_THRESHOLD };
  }

  getExternalReports(injuryId: string) {
    return this.repo.getExternalReports(injuryId);
  }

  async updateExternalReportStatus(reportId: number, status: ExternalReportStatus, note?: string) {
    const report = await this.repo.findExternalReportById(reportId);
    if (!report) throw new AppError(404, "EXTERNAL_REPORT_NOT_FOUND");
    return this.repo.updateExternalReportStatus(reportId, status, note);
  }
}
