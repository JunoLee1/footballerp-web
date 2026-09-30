import { PlayerCallupRepository } from "./player-callup.repo";
import { NotificationRepository } from "../notification/notification.repo";
import { writeAuditLog } from "../lib/auditLog";
import { AppError } from "../lib/appError";
import { CreateCallupDto, RejectCallupDto, CallupListQuery } from "./dto/player-callup.dto";

export class PlayerCallupService {
  constructor(
    private repo: PlayerCallupRepository,
    private notifRepo: NotificationRepository,
  ) {}

  getAll(query: CallupListQuery) {
    return this.repo.findAll(query);
  }

  async getById(id: number) {
    const callup = await this.repo.findById(id);
    if (!callup) throw new AppError(404, "CALLUP_NOT_FOUND");
    return callup;
  }

  async create(dto: CreateCallupDto, requestedById: string) {
    const existing = await this.repo.findActiveByPlayerId(dto.playerId);
    if (existing) throw new AppError(409, "CALLUP_ALREADY_ACTIVE");

    const callup = await this.repo.create({ ...dto, requestedById });

    void this.notifRepo
      .createForYouthHeadCoach(
        callup.fromTeam.id,
        "CALLUP_REQUESTED",
        () => ({
          title: "유소년 콜업 서류 요청",
          body: `${callup.player.playerName} 선수의 1군 콜업 서류 확인이 필요합니다.`,
        }),
        callup.id,
      )
      .catch(console.error);

    void this.notifRepo
      .createForMedicalStaff(
        "CALLUP_REQUESTED",
        () => ({
          title: "유소년 콜업 서류 요청",
          body: `${callup.player.playerName} 선수의 1군 콜업 의무 서류 확인이 필요합니다.`,
        }),
        callup.id,
      )
      .catch(console.error);

    const guardianId = callup.player.guardianId;
    if (guardianId) {
      void this.notifRepo
        .createForGuardian(
          guardianId,
          "CALLUP_REQUESTED",
          () => ({
            title: "1군 콜업 요청",
            body: `${callup.player.playerName} 선수에게 1군 콜업 요청이 들어왔습니다.`,
          }),
          callup.id,
        )
        .catch(console.error);
    }

    return callup;
  }

  async approve(id: number, approvedById: string, isGM: boolean) {
    const callup = await this.repo.findById(id);
    if (!callup) throw new AppError(404, "CALLUP_NOT_FOUND");

    if (callup.callupType === "TRAINING") {
      if (callup.status !== "REQUESTED") throw new AppError(409, "INVALID_STATUS");

      const updated = await this.repo.approve(id, approvedById);

      void this.notifRepo
        .createForUser(
          callup.requestedBy.id,
          "CALLUP_APPROVED",
          () => ({
            title: "훈련 콜업 승인",
            body: `${callup.player.playerName} 선수의 훈련 참가 콜업이 승인됐습니다.`,
          }),
          id,
        )
        .catch(console.error);

      return updated;
    }

    // OFFICIAL — GM만 승인 가능
    if (!isGM) throw new AppError(403, "FORBIDDEN");
    if (callup.status !== "DOCS_SUBMITTED") throw new AppError(409, "INVALID_STATUS");

    const contract = await this.repo.findActiveContract(callup.player.id);
    if (!contract) throw new AppError(409, "NO_ACTIVE_CONTRACT");

    const updated = await this.repo.approve(id, approvedById);
    await this.repo.updatePlayerTeam(callup.player.id, callup.toTeam.id);
    await writeAuditLog({ actorId: approvedById, action: "CALLUP_APPROVED", targetId: id });

    void this.notifRepo
      .createForUser(
        callup.requestedBy.id,
        "CALLUP_APPROVED",
        () => ({
          title: "콜업 승인",
          body: `${callup.player.playerName} 선수의 1군 콜업이 승인됐습니다.`,
        }),
        id,
      )
      .catch(console.error);

    const guardianId = callup.player.guardianId;
    if (guardianId) {
      void this.notifRepo
        .createForGuardian(
          guardianId,
          "GUARDIAN_CHILD_CALLUP",
          () => ({
            title: "1군 콜업 승인",
            body: `${callup.player.playerName} 선수의 1군 콜업이 승인됐습니다. 필요 서류를 확인해주세요.`,
          }),
          id,
        )
        .catch(console.error);

      const guardianUser = await this.repo.findGuardianEmail(guardianId).catch(() => null);
      if (guardianUser?.email) {
        const { sendGuardianCallupEmail } = await import("../lib/email");
        void sendGuardianCallupEmail(
          guardianUser.email,
          callup.player.playerName,
          updated.requiredDocuments ?? [],
        ).catch(console.error);
      }
    }

    return updated;
  }

  async reject(id: number, approvedById: string, dto: RejectCallupDto) {
    const callup = await this.repo.findById(id);
    if (!callup) throw new AppError(404, "CALLUP_NOT_FOUND");
    if (callup.status !== "DOCS_SUBMITTED") throw new AppError(409, "INVALID_STATUS");
    if (!dto.reason?.trim()) throw new AppError(400, "REASON_REQUIRED");

    const updated = await this.repo.reject(id, approvedById, dto.reason);
    await writeAuditLog({ actorId: approvedById, action: "CALLUP_REJECTED", targetId: id });

    void this.notifRepo
      .createForUser(
        callup.requestedBy.id,
        "CALLUP_REJECTED",
        () => ({
          title: "콜업 거절",
          body: `${callup.player.playerName} 선수의 1군 콜업이 거절됐습니다. 사유: ${dto.reason}`,
        }),
        id,
      )
      .catch(console.error);

    return updated;
  }

  async confirmYouth(id: number, actorTeamId: number | null) {
    const callup = await this.repo.findById(id);
    if (!callup) throw new AppError(404, "CALLUP_NOT_FOUND");
    if (callup.callupType === "TRAINING") throw new AppError(409, "INVALID_CALLUP_TYPE");
    if (callup.status !== "REQUESTED") throw new AppError(409, "INVALID_STATUS");
    if (actorTeamId !== callup.fromTeam.id) throw new AppError(403, "FORBIDDEN");

    const updated = await this.repo.confirmYouth(id);

    if (updated.medicalConfirmed) {
      const submitted = await this.repo.submitDocs(id);
      void this.notifRepo.createForGM("CALLUP_DOCS_READY", () => ({ title: "콜업 서류 완료", body: `${callup.player.playerName} 선수 콜업 서류가 완료됐습니다. 최종 승인을 진행해주세요.` }), id).catch(console.error);
      void this.notifRepo.createForTD("CALLUP_DOCS_READY", () => ({ title: "콜업 서류 완료", body: `${callup.player.playerName} 선수 콜업 서류가 완료됐습니다.` }), id).catch(console.error);
      return submitted;
    }

    return updated;
  }

  async confirmMedical(id: number) {
    const callup = await this.repo.findById(id);
    if (!callup) throw new AppError(404, "CALLUP_NOT_FOUND");
    if (callup.callupType === "TRAINING") throw new AppError(409, "INVALID_CALLUP_TYPE");
    if (callup.status !== "REQUESTED") throw new AppError(409, "INVALID_STATUS");

    const updated = await this.repo.confirmMedical(id);

    if (updated.youthCoachConfirmed) {
      const submitted = await this.repo.submitDocs(id);
      void this.notifRepo.createForGM("CALLUP_DOCS_READY", () => ({ title: "콜업 서류 완료", body: `${callup.player.playerName} 선수 콜업 서류가 완료됐습니다. 최종 승인을 진행해주세요.` }), id).catch(console.error);
      void this.notifRepo.createForTD("CALLUP_DOCS_READY", () => ({ title: "콜업 서류 완료", body: `${callup.player.playerName} 선수 콜업 서류가 완료됐습니다.` }), id).catch(console.error);
      return submitted;
    }

    return updated;
  }

  async complete(id: number, actorId: string) {
    const callup = await this.repo.findById(id);
    if (!callup) throw new AppError(404, "CALLUP_NOT_FOUND");
    if (callup.status !== "APPROVED") throw new AppError(409, "INVALID_STATUS");

    const completed = await this.repo.complete(id);

    if (callup.callupType === "OFFICIAL") {
      await this.repo.updatePlayerTeam(callup.player.id, callup.fromTeam.id);
      await writeAuditLog({ actorId, action: "CALLUP_COMPLETED", targetId: id });
    }

    return completed;
  }
}
