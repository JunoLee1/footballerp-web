import { AppError } from "../../lib/appError";
import type { DisposalRepository } from "./disposal.repo";
import type { FmVerifyDto, GmApproveDto, RejectDisposalDto } from "./dto/disposal.dto";

export class DisposalService {
  constructor(private repo: DisposalRepository) {}

  async getVerification(equipmentId: number) {
    const record = await this.repo.findVerification(equipmentId);
    if (!record) throw new AppError(404, "DISPOSAL_VERIFICATION_NOT_FOUND");
    return record;
  }

  async requestDisposal(equipmentId: number, requestedById: string) {
    const unit = await this.repo.findUnitById(equipmentId);
    if (!unit) throw new AppError(404, "EQUIPMENT_UNIT_NOT_FOUND");
    if (unit.status === "RETIRED") throw new AppError(409, "UNIT_ALREADY_RETIRED");

    const existing = await this.repo.findVerification(equipmentId);
    if (existing && ["PENDING", "FM_VERIFIED"].includes(existing.status)) {
      throw new AppError(409, "DISPOSAL_VERIFICATION_PENDING");
    }

    return this.repo.createVerification(equipmentId, requestedById);
  }

  async fmVerify(equipmentId: number, verifiedById: string, dto: FmVerifyDto) {
    const verification = await this.repo.findVerification(equipmentId);
    if (!verification) throw new AppError(404, "DISPOSAL_VERIFICATION_NOT_FOUND");
    if (verification.status !== "PENDING") throw new AppError(400, "INVALID_VERIFICATION_STATUS");

    if (verification.equipment.isHighValue && !dto.photoUrl) {
      throw new AppError(400, "PHOTO_REQUIRED_FOR_HIGH_VALUE");
    }

    const updated = await this.repo.fmVerify(verification.id, verifiedById, dto);

    if (!verification.equipment.isHighValue) {
      await this.repo.updateUnitDisposed(equipmentId, verifiedById);
    }

    return updated;
  }

  async gmApprove(equipmentId: number, gmId: string, dto: GmApproveDto) {
    const verification = await this.repo.findVerification(equipmentId);
    if (!verification) throw new AppError(404, "DISPOSAL_VERIFICATION_NOT_FOUND");
    if (verification.status !== "FM_VERIFIED") throw new AppError(400, "INVALID_VERIFICATION_STATUS");
    if (!verification.equipment.isHighValue) throw new AppError(400, "GM_APPROVAL_NOT_REQUIRED");

    const updated = await this.repo.gmApprove(verification.id, dto);
    await this.repo.updateUnitDisposed(equipmentId, gmId);
    return updated;
  }

  async rejectVerification(equipmentId: number, dto: RejectDisposalDto) {
    const verification = await this.repo.findVerification(equipmentId);
    if (!verification) throw new AppError(404, "DISPOSAL_VERIFICATION_NOT_FOUND");
    if (!["PENDING", "FM_VERIFIED"].includes(verification.status)) {
      throw new AppError(400, "INVALID_VERIFICATION_STATUS");
    }
    if (!dto.reason) throw new AppError(400, "REJECTION_REASON_REQUIRED");
    return this.repo.rejectVerification(verification.id, dto.reason);
  }
}
