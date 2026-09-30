import type { PrismaClient } from "../generated/client";
import { AppError } from "../lib/appError";
import { writeAuditLog } from "../lib/auditLog";
import type { EmployeeContractRepository } from "./employee-contract.repo";
import type {
  CancelEmployeeContractDto,
  SignEmployeeContractDto,
} from "./dto/employee-contract.dto";

export interface UploadedFileInfo {
  path: string;
  filename: string;
  originalname: string;
  size: number;
}

/**
 * HR-facing service for the EmployeeContract skeleton (#371).
 *
 * State machine:
 *   DRAFT → ISSUED → SIGNED
 *      ↓       ↓        ↓
 *   CANCELLED (all states can cancel; no reverse transitions)
 *
 * Re-issuing after CANCELLED is a *new* row (append-only design, Q3) — the
 * caller flow is: cancel → create → issue → sign. Repository & FE both key
 * off `findLatestActiveByDispatch` so old CANCELLED rows never leak into
 * gating decisions.
 *
 * The `assertContractSigned` helper is the reusable **EXECUTION gate helper**
 * — mirrors the shape of `HiringDocumentService.assertRequiredDocsApproved`
 * so `HiringDispatchService.dispatch()` can compose both gates as a sequence
 * of `await this.gate(x)` calls without cross-coupling.
 */
export class EmployeeContractService {
  constructor(
    private repo: EmployeeContractRepository,
    private prisma: PrismaClient,
  ) {}

  // ────────────────────────────────────────────
  // create — new DRAFT row for a dispatch
  // ────────────────────────────────────────────

  async createDraft(hiringDispatchId: number, actorId: string) {
    if (!Number.isInteger(hiringDispatchId) || hiringDispatchId <= 0) {
      throw new AppError(400, "INVALID_DISPATCH_ID");
    }
    // Existence check — orphaned contracts are hard to reason about.
    const dispatch = await this.prisma.hiringDispatch.findUnique({
      where: { id: hiringDispatchId },
      select: { id: true },
    });
    if (!dispatch) throw new AppError(404, "DISPATCH_NOT_FOUND");

    const created = await this.repo.createDraft({
      hiringDispatchId,
      createdById: actorId,
    });

    void writeAuditLog({
      actorId,
      action: "EMPLOYEE_CONTRACT_CREATED",
      targetId: created.id,
      detail: { hiringDispatchId },
    }).catch(console.error);

    return created;
  }

  // ────────────────────────────────────────────
  // issue — DRAFT → ISSUED with contract file
  // ────────────────────────────────────────────

  async issue(id: number, file: UploadedFileInfo, actorId: string) {
    const ec = await this.repo.findById(id);
    if (!ec) throw new AppError(404, "CONTRACT_NOT_FOUND");
    if (ec.status !== "DRAFT") {
      // Encode current + target state in the code so FE can render precise
      // error copy without a second GET. Matches the AppError-code-only
      // convention used elsewhere (#372 impl / hiring-document).
      throw new AppError(409, `INVALID_STATE_TRANSITION:${ec.status}->ISSUED`);
    }

    const updated = await this.repo.applyIssue(id, {
      fileUrl: (file as any).gcsUrl,
      fileName: file.originalname,
      issuedById: actorId,
    });

    void writeAuditLog({
      actorId,
      action: "EMPLOYEE_CONTRACT_ISSUED",
      targetId: id,
      detail: {
        hiringDispatchId: ec.hiringDispatchId,
        fileName: file.originalname,
      },
    }).catch(console.error);

    return updated;
  }

  // ────────────────────────────────────────────
  // sign — ISSUED → SIGNED with signed scan + signedAt (Q4 single action)
  // ────────────────────────────────────────────

  async sign(
    id: number,
    file: UploadedFileInfo,
    dto: SignEmployeeContractDto,
    actorId: string,
  ) {
    const signedAtRaw = dto?.signedAt?.trim();
    if (!signedAtRaw) throw new AppError(400, "SIGNED_AT_REQUIRED");
    const signedAt = new Date(signedAtRaw);
    if (Number.isNaN(signedAt.getTime())) throw new AppError(400, "INVALID_SIGNED_AT");

    const ec = await this.repo.findById(id);
    if (!ec) throw new AppError(404, "CONTRACT_NOT_FOUND");
    if (ec.status !== "ISSUED") {
      throw new AppError(409, `INVALID_STATE_TRANSITION:${ec.status}->SIGNED`);
    }

    const updated = await this.repo.applySign(id, {
      signedFileUrl: (file as any).gcsUrl,
      signedFileName: file.originalname,
      signedAt,
      signedConfirmedById: actorId,
    });

    void writeAuditLog({
      actorId,
      action: "EMPLOYEE_CONTRACT_SIGNED",
      targetId: id,
      detail: {
        hiringDispatchId: ec.hiringDispatchId,
        signedAt: signedAt.toISOString(),
        fileName: file.originalname,
      },
    }).catch(console.error);

    return updated;
  }

  // ────────────────────────────────────────────
  // cancel — any non-CANCELLED → CANCELLED with reason
  // ────────────────────────────────────────────

  async cancel(id: number, dto: CancelEmployeeContractDto, actorId: string) {
    const reason = dto?.cancelReason?.trim();
    if (!reason) throw new AppError(400, "CANCEL_REASON_REQUIRED");
    if (reason.length > 2000) throw new AppError(400, "CANCEL_REASON_TOO_LONG");

    const ec = await this.repo.findById(id);
    if (!ec) throw new AppError(404, "CONTRACT_NOT_FOUND");
    if (ec.status === "CANCELLED") throw new AppError(409, "ALREADY_CANCELLED");

    const updated = await this.repo.applyCancel(id, {
      cancelReason: reason,
      cancelledById: actorId,
    });

    void writeAuditLog({
      actorId,
      action: "EMPLOYEE_CONTRACT_CANCELLED",
      targetId: id,
      detail: {
        hiringDispatchId: ec.hiringDispatchId,
        previousStatus: ec.status,
        cancelReason: reason,
      },
    }).catch(console.error);

    return updated;
  }

  // ────────────────────────────────────────────
  // reads
  // ────────────────────────────────────────────

  listByDispatch(hiringDispatchId: number) {
    return this.repo.findAllByDispatch(hiringDispatchId);
  }

  // ────────────────────────────────────────────
  // EXECUTION gate helper (composed by HiringDispatchService.dispatch)
  // ────────────────────────────────────────────

  /**
   * Assert that the latest non-CANCELLED EmployeeContract for a dispatch is
   * SIGNED. Throws 400 CONTRACT_NOT_ISSUED when no active contract exists,
   * 400 CONTRACT_NOT_SIGNED:<status> when the latest one is still DRAFT or
   * ISSUED. Override is out of scope (Q7) — HR must complete the signing
   * before dispatch executes.
   *
   * Same shape as `HiringDocumentService.assertRequiredDocsApproved` so
   * `dispatch()` composes them left-to-right without cross-coupling.
   */
  async assertContractSigned(hiringDispatchId: number): Promise<void> {
    const latest = await this.repo.findLatestActiveByDispatch(hiringDispatchId);
    if (!latest) {
      throw new AppError(400, "CONTRACT_NOT_ISSUED");
    }
    if (latest.status !== "SIGNED") {
      // Encode current status in the code so FE can render precise error
      // copy without a second GET (matches the MISSING_APPROVED_DOCS:
      // convention used by hiring-document).
      throw new AppError(400, `CONTRACT_NOT_SIGNED:${latest.status}`);
    }
  }
}
