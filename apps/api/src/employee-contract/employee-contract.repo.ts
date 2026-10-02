import type { PrismaClient } from "../generated/client";
import type { EmployeeContractStatus } from "../generated/enums";

/**
 * Shared select for actor badges on every read path — same shape as
 * HiringDocument to keep FE assumptions consistent (id + username + nickname
 * only; no PII bleed).
 */
const ACTOR_SELECT = { id: true, username: true, nickname: true } as const;

const EC_INCLUDE = {
  createdBy: { select: ACTOR_SELECT },
  issuedBy: { select: ACTOR_SELECT },
  signedConfirmedBy: { select: ACTOR_SELECT },
  cancelledBy: { select: ACTOR_SELECT },
} as const;

export interface CreateDraftData {
  hiringDispatchId: string;
  createdById: string;
}

export interface IssueData {
  fileUrl: string;
  fileName: string;
  issuedById: string;
}

export interface SignData {
  signedFileUrl: string;
  signedFileName: string;
  signedAt: Date;
  signedConfirmedById: string;
}

export interface CancelData {
  cancelReason: string;
  cancelledById: string;
}
//TODO: dto 파일로 분리
/**
 * Prisma boundary for EmployeeContract. All mutations are `update` by id
 * against the current status (validated in the service). Reads always come
 * back with actor badges — the FE renders "issued by X on Y" without a
 * second call.
 */
export class EmployeeContractRepository {
  constructor(private prisma: PrismaClient) {}

  createDraft(data: CreateDraftData) {
    return this.prisma.employeeContract.create({
      data: {
        hiringDispatchId: data.hiringDispatchId,
        createdById: data.createdById,
        // status defaults to DRAFT via prisma schema default
      },
      include: EC_INCLUDE,
    });
  }

  findById(id: string) {
    return this.prisma.employeeContract.findUnique({
      where: { id },
      include: EC_INCLUDE,
    });
  }

  /**
   * Latest non-CANCELLED contract for a dispatch — powers the EXECUTION gate
   * (`assertContractSigned`) and the "current status" badge in the FE.
   * Returns null when no such row exists (dispatch has no active contract).
   */
  findLatestActiveByDispatch(hiringDispatchId: string) {
    return this.prisma.employeeContract.findFirst({
      where: {
        hiringDispatchId,
        status: { not: "CANCELLED" },
      },
      orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
      include: EC_INCLUDE,
    });
  }

  /**
   * Full history (all statuses) for a dispatch, newest first. `distinct`
   * isn't needed — every row is a distinct contract; append-only design (Q3).
   */
  findAllByDispatch(hiringDispatchId: string) {
    return this.prisma.employeeContract.findMany({
      where: { hiringDispatchId },
      orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
      include: EC_INCLUDE,
    });
  }

  applyIssue(id: string, data: IssueData) {
    return this.prisma.employeeContract.update({
      where: { id },
      data: {
        status: "ISSUED",
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        issuedById: data.issuedById,
        issuedAt: new Date(),
      },
      include: EC_INCLUDE,
    });
  }

  applySign(id: string, data: SignData) {
    return this.prisma.employeeContract.update({
      where: { id },
      data: {
        status: "SIGNED",
        signedFileUrl: data.signedFileUrl,
        signedFileName: data.signedFileName,
        signedAt: data.signedAt,
        signedConfirmedById: data.signedConfirmedById,
        signedConfirmedAt: new Date(),
      },
      include: EC_INCLUDE,
    });
  }

  applyCancel(id: string, data: CancelData) {
    return this.prisma.employeeContract.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelReason: data.cancelReason,
        cancelledById: data.cancelledById,
        cancelledAt: new Date(),
      },
      include: EC_INCLUDE,
    });
  }
}

export type { EmployeeContractStatus };
