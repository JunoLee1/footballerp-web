import crypto from "crypto";
import { AppError } from "../lib/appError";
import { decrypt } from "../lib/crypto";
import type { GuardianRepository } from "./guardian.repo";
import type { TrainingRepository } from "../training/training.repo";
import type { InjuryRepository } from "../injury/injury.repo";
import type { AcademyFeeRepository } from "../academy-fee/academy-fee.repo";
import type { LinkBySearchDto, LinkByCodeDto, IssueInviteCodeDto } from "./dto/guardian.dto";

export class GuardianService {
  constructor(
    private repo: GuardianRepository,
    private trainingRepo: TrainingRepository,
    private injuryRepo: InjuryRepository,
    private feeRepo: AcademyFeeRepository,
  ) {}

  async linkBySearch(dto: LinkBySearchDto, guardianId: string) {
    const player = await this.repo.findPlayerBySearch(
      dto.studentCode,
      dto.playerName,
    );
    if (!player) throw new AppError(404, "PLAYER_NOT_FOUND");

    // dateOfBirth is now encrypted — verify by decrypting and comparing date string
    if (player.dateOfBirthEncrypted && player.dateOfBirthIv) {
      const decryptedDob = decrypt(player.dateOfBirthEncrypted, player.dateOfBirthIv);
      const requestedDob = new Date(dto.dateOfBirth).toISOString().slice(0, 10);
      const storedDob = new Date(decryptedDob).toISOString().slice(0, 10);
      if (requestedDob !== storedDob) throw new AppError(404, "PLAYER_NOT_FOUND");
    }

    if (player.guardianId !== null) throw new AppError(409, "ALREADY_LINKED");
    return this.repo.linkGuardianToPlayer(player.id, guardianId);
  }

  async linkByCode(dto: LinkByCodeDto, guardianId: string) {
    const record = await this.repo.findInviteCode(dto.code);
    if (!record) throw new AppError(404, "INVALID_CODE");
    if (record.usedAt !== null) throw new AppError(409, "CODE_ALREADY_USED");
    if (record.expiresAt < new Date()) throw new AppError(410, "CODE_EXPIRED");

    await Promise.all([
      this.repo.linkGuardianToPlayer(record.playerId, guardianId),
      this.repo.markCodeUsed(record.id, guardianId),
    ]);
  }

  async issueInviteCode(dto: IssueInviteCodeDto, issuedById: string) {
    const existing = await this.repo.findActiveInviteCode(dto.playerId);
    if (existing) return existing;

    const code = crypto.randomBytes(16).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    return this.repo.createInviteCode({ code, playerId: dto.playerId, issuedById, expiresAt });
  }

  async getChildren(guardianId: string) {
    return this.repo.findChildrenByGuardian(guardianId);
  }

  async getChildAttendance(playerId: string, from?: string, to?: string) {
    return this.trainingRepo.findResults({ playerId, ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}) });
  }

  async getChildInjuries(playerId: string) {
    return this.injuryRepo.findByPlayerWithReport(playerId);
  }

  async getChildFees(playerId: string) {
    return this.feeRepo.findByPlayer(playerId);
  }

  async submitFeeProof(feeId: string, url: string, playerId: string) {
    const fee = await this.feeRepo.findById(feeId);
    if (!fee) throw new AppError(404, "ACADEMY_FEE_NOT_FOUND");
    if (fee.playerId !== playerId) throw new AppError(403, "FORBIDDEN");
    return this.feeRepo.submitPaymentProof(feeId, url);
  }

  async getDashboard(playerId: string) {
    const child = await this.repo.findChildById(playerId);
    if (!child) throw new AppError(404, "CHILD_NOT_FOUND");

    const [
      childInfo, matches, sessions, attendanceGroups,
      latestEval, activePlan, injuries, lastMatchStats, fees,
    ] = await this.repo.findDashboard(child.id, child.teamId ?? null, new Date());

    const attendanceMap = Object.fromEntries(
      (attendanceGroups).map((g) => [g.attendance, g._count.attendance])
    );

    const activeInjuries = injuries.filter((i) =>
      !["RECOVERED", "RETURNED"].includes(i.status)
    );
    const historyInjuries = injuries.filter((i) =>
      ["RECOVERED", "RETURNED"].includes(i.status)
    );

    let suspensionReason: "FEE_LOCK" | "SAFEGUARD" | null = null;
    if ((child.status as string) === "SUSPENDED") suspensionReason = "FEE_LOCK";
    else if (child.user?.isSuspended) suspensionReason = "SAFEGUARD";

    return {
      child: childInfo,
      suspension: { reason: suspensionReason },
      upcoming: { matches, sessions },
      attendance: {
        total: attendanceGroups.reduce((s: number, g) => s + g._count.attendance, 0),
        attended: attendanceMap["ATTENDED"] ?? 0,
        absent: attendanceMap["ABSENT"] ?? 0,
        late: attendanceMap["LATE"] ?? 0,
      },
      growth: { latestEvaluation: latestEval ?? null, activeDevelopmentPlan: activePlan ?? null },
      injuries: { active: activeInjuries, history: historyInjuries },
      stats: { lastMatch: lastMatchStats ?? null },
      fees: {
        pending: fees.filter((f) => f.status === "PENDING"),
        overdue: fees.filter((f) => f.status === "OVERDUE"),
      },
    };
  }
}
