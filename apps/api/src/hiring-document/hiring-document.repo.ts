import type { PrismaClient } from "../generated/client";
import type { HiringDocReviewStatus } from "../generated/enums";

/**
 * Includes shared by all read paths so the FE always gets uploader/reviewer
 * badges without a follow-up round-trip. Kept narrow (id/username/nickname)
 * to avoid dragging User PII through the JSON payload.
 */
const DOC_INCLUDE = {
  uploadedBy: { select: { id: true, username: true, nickname: true } },
  reviewedBy: { select: { id: true, username: true, nickname: true } },
} as const;

export interface CreateHiringDocumentData {
  applicationId?: string;
  hiringDispatchId?: string;
  docType: string;
  fileUrl: string;
  fileName?: string;
  fileSize?: number;
  uploadedById: string;
}

export interface UpdateReviewData {
  status: HiringDocReviewStatus;
  reviewerId: string;
  reviewNotes: string | null;
}
//TODO: dto 옮기자

/**
 * Prisma boundary for HiringDocument. The dispatch EXECUTION gate reads
 * "latest row per (target, docType)" via `findLatestPerDocType()` — implemented
 * as a Prisma `distinct` on docType with descending createdAt ordering so
 * append-only re-uploads Just Work (Q7).
 */
export class HiringDocumentRepository {
  constructor(private prisma: PrismaClient) {}

  create(data: CreateHiringDocumentData) {
    return this.prisma.hiringDocument.create({
      data: {
        ...(data.applicationId !== undefined && { applicationId: data.applicationId }),
        ...(data.hiringDispatchId !== undefined && { hiringDispatchId: data.hiringDispatchId }),
        docType: data.docType,
        fileUrl: data.fileUrl,
        ...(data.fileName !== undefined && { fileName: data.fileName }),
        ...(data.fileSize !== undefined && { fileSize: data.fileSize }),
        uploadedById: data.uploadedById,
      },
      include: DOC_INCLUDE,
    });
  }

  findById(id: string) {
    return this.prisma.hiringDocument.findUnique({
      where: { id },
      include: DOC_INCLUDE,
    });
  }

  updateReview(id: string, data: UpdateReviewData) {
    return this.prisma.hiringDocument.update({
      where: { id },
      data: {
        status: data.status,
        reviewedById: data.reviewerId,
        reviewedAt: new Date(),
        reviewNotes: data.reviewNotes,
      },
      include: DOC_INCLUDE,
    });
  }

  /**
   * All rows for a target (application xor dispatch), newest first. The
   * service groups by docType to expose "current" state; callers wanting the
   * raw history use listHistory(). Sorted by createdAt DESC — the covering
   * index on `(target, docType, createdAt DESC)` matches this shape 1-1.
   */
  findAllByTarget(target: { applicationId?: string; hiringDispatchId?: string }) {
    const where = target.applicationId != null
      ? { applicationId: target.applicationId }
      : { hiringDispatchId: target.hiringDispatchId! };
    return this.prisma.hiringDocument.findMany({
      where,
      include: DOC_INCLUDE,
      orderBy: { createdAt: "desc" as const },
    });
  }

  findHistoryByDocType(
    target: { applicationId?: string; hiringDispatchId?: string },
    docType: string,
  ) {
    const where = target.applicationId != null
      ? { applicationId: target.applicationId, docType }
      : { hiringDispatchId: target.hiringDispatchId!, docType };
    return this.prisma.hiringDocument.findMany({
      where,
      include: DOC_INCLUDE,
      orderBy: { createdAt: "desc" as const },
    });
  }

  /**
   * Latest row per docType for a given target. Used by the HiringDispatch
   * EXECUTION gate — `assertRequiredDocsApproved` filters this set to APPROVED
   * and compares against `requiredDocuments` (Q7 append-only, Q10 subset check).
   */
  findLatestPerDocType(target: { applicationId?: string; hiringDispatchId?: string }) {
    const where = target.applicationId != null
      ? { applicationId: target.applicationId }
      : { hiringDispatchId: target.hiringDispatchId! };
    return this.prisma.hiringDocument.findMany({
      where,
      // Prisma `distinct` returns the first row per group in the current
      // ordering, so [createdAt desc, id desc] guarantees the newest row wins
      // even for ties on createdAt (append-only inserts within the same ms).
      orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
      distinct: ["docType"],
    });
  }
}
