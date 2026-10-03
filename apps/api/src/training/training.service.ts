import { TrainingRepository } from "./training.repo";
import { AppError } from "../lib/appError";
import { CreateSessionDto, AddContentDto, AddParticipantsDto, UpsertResultDto, SessionListQuery } from "./dto/training.dto";
import { NotificationRepository } from "../notification/notification.repo";
import { writeAuditLog } from "../lib/auditLog";
import { NotificationService } from "../notification/notification.service";
import { getPrisma } from "../lib/prisma";

const notificationService = new NotificationService(new NotificationRepository(getPrisma()));

export function calcEffectiveAbsences(absences: number, lateCount: number): number {
  return absences + Math.floor(lateCount / 3);
}

export function shouldTriggerPenalty(effectiveAbsences: number): boolean {
  return effectiveAbsences > 0 && effectiveAbsences % 3 === 0;
}

export class TrainingService {
  constructor(
    private repo: TrainingRepository,
    private notifRepo?: NotificationRepository,
  ) {}

  getSessions(query: SessionListQuery, actorClubId?: string | null) {
    return this.repo.findAll(query, actorClubId);
  }

  async getSessionById(id: string, actorClubId?: string | null) {
    const session = await this.repo.findById(id, actorClubId);
    if (!session) throw new AppError(404, "SESSION_NOT_FOUND");
    return session;
  }

  async createSession(dto: CreateSessionDto, createdById: string, actorClubId?: string | null) {
    const sessionDate = new Date(dto.date);
    if (sessionDate > new Date()) {
      throw new AppError(400, "SESSION_DATE_FUTURE_NOT_ALLOWED");
    }
    const session = await this.repo.create(dto, createdById, actorClubId);
    void this.repo.addAllActivePlayers(session.id, session.teamId).catch(console.error);
    if (this.notifRepo) {
      void this.notifRepo
        .createForHeadCoach(
          "TRAINING_SESSION_PENDING",
          () => ({
            title: "훈련 세션 승인 요청",
            body: `${new Date(dto.date).toLocaleDateString("ko-KR")} 훈련 세션(${dto.sessionType})이 등록되어 승인이 필요합니다.`,
          }),
          session.id,
        )
        .catch(console.error);
    }
    return session;
  }

  async approveSession(id: string, approvedById: string, actorClubId?: string | null) {
    const session = await this.repo.findById(id, actorClubId);
    if (!session) throw new AppError(404, "SESSION_NOT_FOUND");
    if (session.isApproved) throw new AppError(409, "ALREADY_APPROVED");

    const presentResults = (session.results ?? []).filter(
      (r: any) => r.attendance !== "ABSENT_AUTHORIZED" && r.attendance !== "ABSENT_UNAUTHORIZED"
    );
    const missingCount = presentResults.filter((r: any) => r.performanceScore == null).length;

    const approved = await this.repo.approve(id, approvedById);

    // BH8: 고퍼포먼스 선수(score ≥ 8) 일괄 알림 (10점 만점)
    const HIGH_PERF_THRESHOLD = 8;
    const highPerfResults = presentResults.filter(
      (r: any) => r.performanceScore != null && r.performanceScore >= HIGH_PERF_THRESHOLD
    );

    if (highPerfResults.length > 0 && this.notifRepo) {
      const names = highPerfResults.map((r: any) => r.player?.playerName ?? r.playerId).join(", ");
      await this.notifRepo
        .createForHeadCoach(
          "TRAINING_HIGH_PERFORMANCE_PLAYER",
          () => ({
            title: "고퍼포먼스 선수",
            body: `${names} 선수가 이번 세션에서 ${HIGH_PERF_THRESHOLD}점 이상을 기록했습니다.`,
          }),
          id,
        )
        .catch(console.error);

      await Promise.all(
        highPerfResults.map(async (r: any) => {
          const player = await this.repo.findPlayerUserId(r.playerId);
          if (player?.userId) {
            await this.notifRepo!
              .createForUser(
                player.userId,
                "TRAINING_HIGH_PERFORMANCE_SELF",
                () => ({
                  title: "훌륭한 훈련이었습니다",
                  body: `오늘 훈련 평가 점수: ${r.performanceScore}점`,
                }),
                id,
              )
              .catch(console.error);
          }
        })
      );
    }

    if (missingCount === 0) return approved;
    return { ...approved, evalWarning: { missing: missingCount, total: presentResults.length } };
  }

  async addContent(sessionId: string, dto: AddContentDto, actorClubId?: string | null) {
    const session = await this.repo.findById(sessionId, actorClubId);
    if (!session) throw new AppError(404, "SESSION_NOT_FOUND");
    return this.repo.addContent(sessionId, dto);
  }

  async addParticipants(sessionId: string, dto: AddParticipantsDto, actorClubId?: string | null) {
    const session = await this.repo.findById(sessionId, actorClubId);
    if (!session) throw new AppError(404, "SESSION_NOT_FOUND");
    return this.repo.addParticipants(sessionId, dto);
  }

  async upsertResult(sessionId: string, dto: UpsertResultDto, actorClubId?: string | null) {
    const session = await this.repo.findById(sessionId, actorClubId);
    if (!session) throw new AppError(404, "SESSION_NOT_FOUND");
    if (dto.performanceScore !== undefined && (dto.performanceScore < 0 || dto.performanceScore > 10)) {
      throw new AppError(400, "PERFORMANCE_SCORE_OUT_OF_RANGE");
    }
    const result = await this.repo.upsertResult(sessionId, dto);

    if (dto.attendance === "ABSENT_UNAUTHORIZED" || dto.attendance === "LATE_UNAUTHORIZED") {
      const { absences, lateCount } = await this.repo.countUnexcusedAttendance(dto.playerId);
      const effective = calcEffectiveAbsences(absences, lateCount);
      const type = dto.attendance === "LATE_UNAUTHORIZED" ? "LATE" : "ABSENT";

      // notify player (fire-and-forget)
      void this.repo
        .findPlayerUserId(dto.playerId)
        .then(async (p) => {
          if (!p?.userId) return;
          await notificationService.notifyAttendanceUnauthorized(p.userId, type, new Date(), lateCount, effective);
          if (shouldTriggerPenalty(effective)) {
            await notificationService.notifyAttendancePenaltyPlayer(p.userId, effective);
          }
        })
        .catch(console.error);

      if (shouldTriggerPenalty(effective)) {
        const player = await this.repo.findPlayerNameById(dto.playerId);
        if (player) {
          void notificationService.notifyAttendancePenalty(player.playerName, effective).catch(console.error);
        }
      }
    }

    return result;
  }

  async updateSession(id: string, data: { date?: string; goal?: string }, _updatedById: string, actorClubId?: string | null) {
    const session = await this.repo.findByIdWithTeam(id, actorClubId);
    if (!session) throw new AppError(404, "SESSION_NOT_FOUND");
    const updated = await this.repo.updateSession(id, data);
    if (session.team?.type === "YOUTH" && this.notifRepo) {
      const teamName = session.team.name;
      const guardianIds = await this.repo.findGuardiansByTeam(session.teamId!);
      for (const guardianId of guardianIds) {
        void this.notifRepo
          .createForGuardian(
            guardianId,
            "YOUTH_SESSION_CHANGED",
            () => ({
              title: `${teamName} 훈련 일정 변경`,
              body: `훈련 일정이 변경됐습니다. 앱에서 확인해주세요.`,
            }),
            session.id,
          )
          .catch(console.error);
      }
    }
    return updated;
  }

  async cancelSession(id: string, actorClubId?: string | null) {
    const session = await this.repo.findByIdWithTeam(id, actorClubId);
    if (!session) throw new AppError(404, "SESSION_NOT_FOUND");
    const result = await this.repo.cancelSession(id);
    if (session.team?.type === "YOUTH" && this.notifRepo) {
      const teamName = session.team.name;
      const guardianIds = await this.repo.findGuardiansByTeam(session.teamId!);
      for (const guardianId of guardianIds) {
        void this.notifRepo
          .createForGuardian(
            guardianId,
            "YOUTH_SESSION_CHANGED",
            () => ({
              title: `${teamName} 훈련 취소`,
              body: `훈련이 취소됐습니다.`,
            }),
            session.id,
          )
          .catch(console.error);
      }
    }
    return result;
  }

  getResults(filters: { from?: string; to?: string; sessionType?: string; playerId?: string; nullOnly?: boolean }) {
    return this.repo.findResults(filters)
  }

  async getResultById(resultId: string) {
    const result = await this.repo.findResultById(resultId);
    if (!result) throw new AppError(404, "RESULT_NOT_FOUND");
    return result;
  }

  async correctAttendance(resultId: string, adminId: string, attendance: string, reason: string) {
    if (!reason?.trim()) throw new AppError(400, "REASON_REQUIRED");
    const result = await this.repo.findResultById(resultId);
    if (!result) throw new AppError(404, "RESULT_NOT_FOUND");
    const updated = await this.repo.updateAttendance(resultId, attendance);
    await writeAuditLog({
      actorId: adminId,
      action: "ATTENDANCE_CORRECTED",
      targetId: resultId,
      detail: { before: result.attendance, after: attendance, reason: reason.trim() },
    });

    // S1: re-evaluate penalty condition when corrected to a present-equivalent status
    if (attendance === "PRESENT" || attendance === "LATE_AUTHORIZED") {
      void (async () => {
        const { absences, lateCount } = await this.repo.countUnexcusedAttendance(result.playerId);
        const effective = calcEffectiveAbsences(absences, lateCount);
        // Log that the penalty threshold was re-evaluated after correction
        await writeAuditLog({
          actorId: adminId,
          action: "ATTENDANCE_PENALTY_CONDITION_REEVALUATED",
          targetId: resultId,
          detail: {
            playerId: result.playerId,
            effectiveAbsences: effective,
            penaltyThresholdMet: shouldTriggerPenalty(effective),
            reason: "Attendance corrected to present-equivalent status",
          },
        });
      })().catch(console.error);
    }

    return updated;
  }
}
