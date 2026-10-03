import type { PrismaClient } from "../generated/client";
import { AppError } from "../lib/appError";
import { writeAuditLog } from "../lib/auditLog";
import type { HiringDocumentRepository } from "./hiring-document.repo";
import type {
  ReviewHiringDocumentDto,
  UploadHiringDocumentDto,
} from "./dto/hiring-document.dto";

export interface UploadedFileInfo {
  path: string;
  filename: string;
  originalname: string;
  size: number;
}

/**
 * HR-facing service for the HiringDocument append-only workflow.
 *
 * Two write paths:
 *   1. `upload`  — HR posts a file for a target (application XOR dispatch);
 *                  always creates a new row (status = PENDING). Re-uploads
 *                  after REJECTED are just another `upload` call (Q7).
 *   2. `review`  — HR flips a PENDING row to APPROVED or REJECTED. Once a
 *                  row is reviewed we don't re-review it (a new upload
 *                  produces a new PENDING row instead), which keeps history
 *                  monotonic and audit-trail-friendly.
 *
 * `assertRequiredDocsApproved` is the reusable **EXECUTION gate helper**
 * — used by HiringDispatch, and intentionally shaped so #371
 * (EmploymentContract) and #374 (task population) can drop in identical
 * `assertContractSigned` / `populateOnboardingTasks` helpers next to it.
 * Each gate is a pure function of the dispatch row and the DB; they compose
 * inside `dispatch()` as a sequence of `await this.gate(x)` calls.
 */
export class HiringDocumentService {
  constructor(
    private repo: HiringDocumentRepository,
    private prisma: PrismaClient,
  ) {}

  // ────────────────────────────────────────────
  // upload — always a new row (append-only)
  // ────────────────────────────────────────────

  async upload(dto: UploadHiringDocumentDto, file: UploadedFileInfo, uploaderId: string) {
    const { applicationId, hiringDispatchId } = dto;
    const hasApp = applicationId != null;
    const hasDisp = hiringDispatchId != null;
    // XOR — exactly one target. Belt-and-braces guard even though the
    // controller layer already checks; multiple entry points could bypass.
    if (hasApp === hasDisp) throw new AppError(400, "XOR_TARGET_REQUIRED");

    const docType = dto.docType.trim();
    if (!docType) throw new AppError(400, "DOC_TYPE_REQUIRED");

    // Existence of the target — cheap check that keeps orphaned rows out.
    if (hasApp) {
      const app = await this.prisma.jobApplication.findUnique({
        where: { id: applicationId! },
        select: { id: true },
      });
      if (!app) throw new AppError(404, "APPLICATION_NOT_FOUND");
    } else {
      const disp = await this.prisma.hiringDispatch.findUnique({
        where: { id: hiringDispatchId! },
        select: { id: true },
      });
      if (!disp) throw new AppError(404, "DISPATCH_NOT_FOUND");
    }

    const created = await this.repo.create({
      ...(hasApp && { applicationId: applicationId! }),
      ...(hasDisp && { hiringDispatchId: hiringDispatchId! }),
      docType,
      fileUrl: (file as any).gcsUrl,
      fileName: file.originalname,
      fileSize: file.size,
      uploadedById: uploaderId,
    });

    void writeAuditLog({
      actorId: uploaderId,
      action: "HIRING_DOCUMENT_UPLOADED",
      targetId: created.id,
      detail: {
        applicationId: applicationId ?? null,
        hiringDispatchId: hiringDispatchId ?? null,
        docType,
        fileName: file.originalname,
      },
    }).catch(console.error);

    return created;
  }

  // ────────────────────────────────────────────
  // review — HR approves or rejects a PENDING row
  // ────────────────────────────────────────────

  async review(id: string, dto: ReviewHiringDocumentDto, reviewerId: string) {
    if (dto.status !== "APPROVED" && dto.status !== "REJECTED") {
      throw new AppError(400, "INVALID_REVIEW_STATUS");
    }

    const notes = dto.reviewNotes?.trim() ?? "";
    if (dto.status === "REJECTED" && notes.length === 0) {
      throw new AppError(400, "REVIEW_NOTES_REQUIRED");
    }
    if (notes.length > 2000) throw new AppError(400, "REVIEW_NOTES_TOO_LONG");

    const doc = await this.repo.findById(id);
    if (!doc) throw new AppError(404, "DOCUMENT_NOT_FOUND");
    // Re-reviewing a settled row is meaningless — HR should upload a new
    // version instead. Enforce once-only review so history stays clean.
    if (doc.status !== "PENDING") throw new AppError(409, "DOCUMENT_NOT_PENDING");

    const updated = await this.repo.updateReview(id, {
      status: dto.status,
      reviewerId,
      reviewNotes: notes || null,
    });

    void writeAuditLog({
      actorId: reviewerId,
      action: dto.status === "APPROVED" ? "HIRING_DOCUMENT_APPROVED" : "HIRING_DOCUMENT_REJECTED",
      targetId: id,
      detail: {
        applicationId: doc.applicationId,
        hiringDispatchId: doc.hiringDispatchId,
        docType: doc.docType,
        reviewNotes: notes || null,
      },
    }).catch(console.error);

    return updated;
  }

  // ────────────────────────────────────────────
  // list — current (latest per docType) + full history
  // ────────────────────────────────────────────

  async listCurrent(target: { applicationId?: string; hiringDispatchId?: string }) {
    this.assertExactlyOneTarget(target);
    return this.repo.findLatestPerDocType(target);
  }

  async listHistory(
    target: { applicationId?: string; hiringDispatchId?: string },
    docType: string,
  ) {
    this.assertExactlyOneTarget(target);
    const trimmed = docType.trim();
    if (!trimmed) throw new AppError(400, "DOC_TYPE_REQUIRED");
    return this.repo.findHistoryByDocType(target, trimmed);
  }

  // ────────────────────────────────────────────
  // EXECUTION gate helper (reusable)
  // ────────────────────────────────────────────

  /**
   * Assert that every entry in `required` has a latest-row APPROVED
   * HiringDocument for the given target. Throws 400 MISSING_APPROVED_DOCS
   * with the missing list in the error message when the check fails.
   *
   * Design notes:
   * - `required` is the source of truth (comes from `JobPosting.requiredDocuments`
   *   when application-anchored, or `HiringDispatch.requiredDocuments` when
   *   application-free).
   * - `required = []` short-circuits to success — an empty list = no gate.
   * - Trimming happens on both sides so free-form docType typos never sneak
   *   through as passing (Q10).
   * - The AppError code is stable ("MISSING_APPROVED_DOCS"); FE surfaces
   *   the missing types via a follow-up GET on listCurrent.
   */
  async assertRequiredDocsApproved(
    target: { applicationId?: string; hiringDispatchId?: string },
    required: string[],
  ): Promise<void> {
    const normRequired = required.map((r) => r.trim()).filter((r) => r.length > 0);
    if (normRequired.length === 0) return;
    this.assertExactlyOneTarget(target);

    const latest = await this.repo.findLatestPerDocType(target);
    const approvedTypes = new Set(
      latest.filter((d) => d.status === "APPROVED").map((d) => d.docType.trim()),
    );
    const missing = normRequired.filter((r) => !approvedTypes.has(r));
    if (missing.length > 0) {
      // AppError only carries a code today; encode the missing list in the
      // message so the FE can parse it. A richer error shape would be a
      // codebase-wide refactor.
      throw new AppError(400, `MISSING_APPROVED_DOCS:${missing.join(",")}`);
    }
  }

  // ────────────────────────────────────────────
  // helpers
  // ────────────────────────────────────────────

  private assertExactlyOneTarget(target: {
    applicationId?: string;
    hiringDispatchId?: string;
  }): void {
    const hasApp = target.applicationId != null;
    const hasDisp = target.hiringDispatchId != null;
    if (hasApp === hasDisp) throw new AppError(400, "XOR_TARGET_REQUIRED");
  }
}
