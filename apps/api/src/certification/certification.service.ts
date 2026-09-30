import { AppError } from "../lib/appError";
import type { CertificationRepository } from "./certification.repo";
import type {
  CreateCertificationDto,
  UpdateCertificationDto,
  RejectCertificationDto,
  CertificationListQuery,
} from "./dto/certification.dto";
import type { CertificationType } from "../generated/enums";

type ApproverRole =
  | { role: "FRONT_OFFICE"; foRole: "HR_MANAGER" }
  | { role: "FRONT_OFFICE"; foRole: "FACILITY_MANAGER" }
  | { role: "MEDICAL_DIRECTOR" }
  | { role: "ADMIN" };

export const CERT_APPROVER_MAP: Record<CertificationType, ApproverRole> = {
  PLAYER_REGISTRATION:         { role: "FRONT_OFFICE", foRole: "HR_MANAGER" },
  PLAYER_CONTRACT:             { role: "FRONT_OFFICE", foRole: "HR_MANAGER" },
  PLAYER_HEALTH_CHECK:         { role: "MEDICAL_DIRECTOR" },
  PLAYER_HEALTH_INSURANCE:     { role: "FRONT_OFFICE", foRole: "HR_MANAGER" },
  PLAYER_FIFA_ID:              { role: "FRONT_OFFICE", foRole: "HR_MANAGER" },
  COACH_UEFA_LICENSE:          { role: "FRONT_OFFICE", foRole: "HR_MANAGER" },
  COACH_YOUTH_LICENSE:         { role: "FRONT_OFFICE", foRole: "HR_MANAGER" },
  COACH_REFEREE_TRAINING:      { role: "FRONT_OFFICE", foRole: "HR_MANAGER" },
  STAFF_DOCTOR_LICENSE:        { role: "FRONT_OFFICE", foRole: "HR_MANAGER" },
  STAFF_MEDICAL_COORDINATOR:   { role: "MEDICAL_DIRECTOR" },
  STAFF_PHYSIOTHERAPIST:       { role: "MEDICAL_DIRECTOR" },
  STAFF_SAFETY_OFFICER:        { role: "FRONT_OFFICE", foRole: "FACILITY_MANAGER" },
  FACILITY_STADIUM_SAFETY:     { role: "FRONT_OFFICE", foRole: "FACILITY_MANAGER" },
  FACILITY_STRUCTURAL:         { role: "FRONT_OFFICE", foRole: "FACILITY_MANAGER" },
  FACILITY_LIGHTING:           { role: "FRONT_OFFICE", foRole: "FACILITY_MANAGER" },
  FACILITY_MEDICAL_EQUIPMENT:  { role: "MEDICAL_DIRECTOR" },
  FACILITY_FIRE_ELECTRICAL:    { role: "FRONT_OFFICE", foRole: "FACILITY_MANAGER" },
  CLUB_LICENSE:                { role: "ADMIN" },
  CLUB_CORPORATE_REGISTRATION: { role: "ADMIN" },
  CLUB_FINANCIAL_AUDIT:        { role: "ADMIN" },
  CLUB_LIABILITY_INSURANCE:    { role: "ADMIN" },
  CLUB_YOUTH_PROGRAM:          { role: "ADMIN" },
};

const MUTABLE_STATUSES = ["DRAFT", "REJECTED"] as const;

export class CertificationService {
  constructor(private repo: CertificationRepository) {}

  list(query: CertificationListQuery) {
    return this.repo.findAll(query);
  }

  async get(id: number) {
    const record = await this.repo.findById(id);
    if (!record) throw new AppError(404, "CERTIFICATION_NOT_FOUND");
    return record;
  }

  create(dto: CreateCertificationDto, ownerId: string) {
    return this.repo.create({ ...dto, ownerId });
  }

  async update(id: number, dto: UpdateCertificationDto) {
    const record = await this.repo.findById(id);
    if (!record) throw new AppError(404, "CERTIFICATION_NOT_FOUND");
    if (record.isLocked) throw new AppError(400, "CERTIFICATION_LOCKED");
    if (!(MUTABLE_STATUSES as readonly string[]).includes(record.status)) {
      throw new AppError(409, "CERTIFICATION_NOT_EDITABLE");
    }
    return this.repo.update(id, dto);
  }

  async submit(id: number) {
    const record = await this.repo.findById(id);
    if (!record) throw new AppError(404, "CERTIFICATION_NOT_FOUND");
    if (!(MUTABLE_STATUSES as readonly string[]).includes(record.status)) {
      throw new AppError(409, "CERTIFICATION_NOT_SUBMITTABLE");
    }
    if (record.status === "REJECTED") return this.repo.resubmit(id);
    return this.repo.submit(id);
  }

  async approve(id: number, approverId: string) {
    const record = await this.repo.findById(id);
    if (!record) throw new AppError(404, "CERTIFICATION_NOT_FOUND");
    if (record.status !== "PENDING_REVIEW") throw new AppError(409, "CERTIFICATION_NOT_PENDING");
    return this.repo.approve(id, approverId);
  }

  async gmApprove(id: number, approverId: string) {
    const record = await this.repo.findById(id);
    if (!record) throw new AppError(404, "CERTIFICATION_NOT_FOUND");
    if (record.status !== "FM_APPROVED") throw new AppError(409, "CERTIFICATION_NOT_FM_APPROVED");
    return this.repo.gmApprove(id, approverId);
  }

  async reject(id: number, dto: RejectCertificationDto) {
    const record = await this.repo.findById(id);
    if (!record) throw new AppError(404, "CERTIFICATION_NOT_FOUND");
    if (!["PENDING_REVIEW", "FM_APPROVED"].includes(record.status)) {
      throw new AppError(409, "CERTIFICATION_NOT_REJECTABLE");
    }
    return this.repo.reject(id, dto.reason);
  }

  async suspend(id: number) {
    const record = await this.repo.findById(id);
    if (!record) throw new AppError(404, "CERTIFICATION_NOT_FOUND");
    if (["CANCELLED", "SUSPENDED"].includes(record.status)) {
      throw new AppError(409, "CERTIFICATION_ALREADY_INACTIVE");
    }
    return this.repo.suspend(id);
  }

  async cancel(id: number) {
    const record = await this.repo.findById(id);
    if (!record) throw new AppError(404, "CERTIFICATION_NOT_FOUND");
    if (record.status === "CANCELLED") throw new AppError(409, "CERTIFICATION_ALREADY_CANCELLED");
    return this.repo.cancel(id);
  }
}
