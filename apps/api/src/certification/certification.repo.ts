import type { PrismaClient } from "../generated/client";
import type {
  CreateCertificationDto,
  UpdateCertificationDto,
  CertificationListQuery,
} from "./dto/certification.dto";

const INCLUDE = {
  owner:        { select: { id: true, username: true } },
  approvedBy:   { select: { id: true, username: true } },
  gmApprovedBy: { select: { id: true, username: true } },
  player:       { select: { id: true, playerName: true } },
  coach:        { select: { id: true, name: true } },
  staff:        { select: { id: true, name: true } },
  reminders:    { select: { id: true, daysThreshold: true, sentAt: true } },
} as const;

export class CertificationRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(query: CertificationListQuery) {
    return this.prisma.certification.findMany({
      where: {
        ...(query.entityType && { entityType: query.entityType }),
        ...(query.certType   && { certType:   query.certType   }),
        ...(query.status     && { status:     query.status     }),
        ...(query.playerId   && { playerId:   query.playerId   }),
        ...(query.coachId    && { coachId:    query.coachId    }),
        ...(query.staffId    && { staffId:    query.staffId    }),
      },
      include: INCLUDE,
      orderBy: { expiresAt: "asc" },
    });
  }

  findById(id: number) {
    return this.prisma.certification.findUnique({ where: { id }, include: INCLUDE });
  }

  create(dto: CreateCertificationDto & { ownerId: string }) {
    return this.prisma.certification.create({
      data: {
        certType:     dto.certType,
        entityType:   dto.entityType,
        issuingBody:  dto.issuingBody,
        issuedAt:     new Date(dto.issuedAt),
        expiresAt:    new Date(dto.expiresAt),
        reminderDays: dto.reminderDays ?? [90, 60, 30],
        notes:        dto.notes ?? null,
        ownerId:      dto.ownerId,
        playerId:     dto.playerId ?? null,
        coachId:      dto.coachId ?? null,
        staffId:      dto.staffId ?? null,
        facilityZone: dto.facilityZone ?? null,
      },
      include: INCLUDE,
    });
  }

  update(id: number, dto: UpdateCertificationDto) {
    return this.prisma.certification.update({
      where: { id },
      data: {
        ...(dto.issuingBody  !== undefined && { issuingBody:  dto.issuingBody }),
        ...(dto.issuedAt     !== undefined && { issuedAt:     new Date(dto.issuedAt) }),
        ...(dto.expiresAt    !== undefined && { expiresAt:    new Date(dto.expiresAt) }),
        ...(dto.documentUrl  !== undefined && { documentUrl:  dto.documentUrl }),
        ...(dto.reminderDays !== undefined && { reminderDays: dto.reminderDays }),
        ...(dto.notes        !== undefined && { notes:        dto.notes }),
      },
      include: INCLUDE,
    });
  }

  submit(id: number) {
    return this.prisma.certification.update({
      where: { id },
      data: { status: "PENDING_REVIEW" },
      include: INCLUDE,
    });
  }

  async resubmit(id: number) {
    await this.prisma.certificationReminderLog.deleteMany({ where: { certificationId: id } });
    return this.prisma.certification.update({
      where: { id },
      data: { status: "PENDING_REVIEW", rejectionReason: null },
      include: INCLUDE,
    });
  }

  approve(id: number, approverId: string) {
    return this.prisma.certification.update({
      where: { id },
      data: { status: "FM_APPROVED", approvedById: approverId, approvedAt: new Date() },
      include: INCLUDE,
    });
  }

  gmApprove(id: number, approverId: string) {
    return this.prisma.certification.update({
      where: { id },
      data: {
        status: "VALID",
        gmApprovedById: approverId,
        gmApprovedAt: new Date(),
        isLocked: true,
      },
      include: INCLUDE,
    });
  }

  reject(id: number, reason: string) {
    return this.prisma.certification.update({
      where: { id },
      data: { status: "REJECTED", rejectionReason: reason },
      include: INCLUDE,
    });
  }

  suspend(id: number) {
    return this.prisma.certification.update({
      where: { id },
      data: { status: "SUSPENDED" },
      include: INCLUDE,
    });
  }

  cancel(id: number) {
    return this.prisma.certification.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: INCLUDE,
    });
  }
}
