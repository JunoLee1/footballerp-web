import type { PrismaClient } from "../../generated/client";
import type { FmVerifyDto, GmApproveDto } from "./dto/disposal.dto";

const VERIFICATION_INCLUDE = {
  equipment: {
    select: { id: true, isHighValue: true, status: true, disposedAt: true, item: { select: { name: true } } },
  },
  requestedBy: { select: { id: true, username: true } },
  verifiedBy:  { select: { id: true, username: true } },
} as const;

export class DisposalRepository {
  constructor(private prisma: PrismaClient) {}

  findUnitById(id: string) {
    return this.prisma.equipmentUnit.findUnique({
      where: { id },
      select: { id: true, status: true, isHighValue: true, disposedAt: true },
    });
  }

  findVerification(equipmentId: string) {
    return this.prisma.equipmentDisposalVerification.findUnique({
      where: { equipmentId },
      include: VERIFICATION_INCLUDE,
    });
  }

  createVerification(equipmentId: string, requestedById: string) {
    return this.prisma.equipmentDisposalVerification.create({
      data: { equipmentId, requestedById },
      include: VERIFICATION_INCLUDE,
    });
  }

  fmVerify(id: string, verifiedById: string, dto: FmVerifyDto) {
    return this.prisma.equipmentDisposalVerification.update({
      where: { id },
      data: {
        verifiedById,
        verifiedAt: new Date(),
        status: "FM_VERIFIED" as any,
        ...(dto.checklistOk !== undefined && { checklistOk: dto.checklistOk }),
        ...(dto.photoUrl && { photoUrl: dto.photoUrl }),
        ...(dto.notes && { notes: dto.notes }),
      },
      include: VERIFICATION_INCLUDE,
    });
  }

  gmApprove(id: string, dto: GmApproveDto) {
    return this.prisma.equipmentDisposalVerification.update({
      where: { id },
      data: {
        status: "GM_APPROVED" as any,
        ...(dto.notes && { notes: dto.notes }),
      },
      include: VERIFICATION_INCLUDE,
    });
  }

  rejectVerification(id: string, reason: string) {
    return this.prisma.equipmentDisposalVerification.update({
      where: { id },
      data: { status: "REJECTED" as any, notes: reason },
      include: VERIFICATION_INCLUDE,
    });
  }

  updateUnitDisposed(equipmentId: string, actorId: string) {
    return this.prisma.equipmentUnit.update({
      where: { id: equipmentId },
      data: {
        status: "RETIRED" as any,
        disposedById: actorId,
        disposedAt: new Date(),
      },
    });
  }
}
