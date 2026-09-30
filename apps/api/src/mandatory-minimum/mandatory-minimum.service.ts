import type { PrismaClient } from "../generated/client";
import { AppError } from "../lib/appError";
import type {
  MinimumEvidenceType,
  MinimumChangeStatus,
} from "../generated/enums";
import { detectMinimumViolation } from "./violation";
import type { ViolationDetection } from "./violation";

// #448 B2: mandatoryMinimum 세팅·변경 워크플로우 (ADR 0022)
//
// 4 개 메소드:
//   propose      — FinanceManager 가 카테고리별 mandatoryMinimum 변경 제안
//   review       — GM 이 PENDING 제안을 APPROVED/REJECTED
//                  (APPROVED 시 categoryPlan.mandatoryMinimum 즉시 반영 — grill Q9)
//   listHistory  — 특정 categoryPlan 의 변경 이력 (proposedAt DESC)
//   listPending  — 시즌 단위 PENDING 목록 (GM 검토 대기함용)

export interface ProposeDto {
  newAmount: number;
  evidenceType: MinimumEvidenceType;
  evidenceUrl?: string | null;
  reason: string;
  effectiveDate: Date;
}

export type ReviewDecision = "APPROVED" | "REJECTED";

type UserSelect = { id: string; email: string; username: string };
type UserSelectWithRole = UserSelect & { role: string; frontOfficeRole: string | null };

const USER_BASIC_SELECT = { id: true, email: true, username: true } as const;
const USER_ROLE_SELECT = { ...USER_BASIC_SELECT, role: true, frontOfficeRole: true } as const;

const CATEGORY_SELECT = {
  categoryPlan: {
    select: {
      id: true,
      financialReportId: true,
      categoryId: true,
      mandatoryMinimum: true,
      expenseCategory: { select: { id: true, code: true, label: true } },
    },
  },
} as const;

type Prisma = Pick<PrismaClient, "budgetCategoryPlan" | "mandatoryMinimumChangeLog" | "financialReport" | "$transaction">;

// #449 B3: review() APPROVED 후 위반 감지 + GM 알림 훅.
// 테스트에서 spy 할 수 있도록 hook injection.
export type ViolationNotifier = (
  seasonId: number,
  categoryPlanId: string,
  detection: ViolationDetection,
) => Promise<void>;

export class MandatoryMinimumService {
  constructor(
    private prisma: Prisma,
    private violationNotifier?: ViolationNotifier,
  ) {}

  /**
   * FinanceManager 제안. 같은 categoryPlanId 에 기존 PENDING 이 있으면 자동 CANCELED (grill Q5).
   * previousAmount 는 현재 categoryPlan.mandatoryMinimum 스냅샷.
   */
  async propose(
    categoryPlanId: string,
    dto: ProposeDto,
    actorId: string,
  ) {
    if (!dto.reason || dto.reason.trim().length === 0) {
      throw new AppError(400, "REASON_REQUIRED");
    }
    if (typeof dto.newAmount !== "number" || !Number.isFinite(dto.newAmount) || dto.newAmount < 0) {
      throw new AppError(400, "AMOUNT_MUST_BE_NON_NEGATIVE");
    }
    if (
      dto.evidenceType !== "CONTRACT" &&
      dto.evidenceType !== "LEGAL" &&
      dto.evidenceType !== "FIXED_COST"
    ) {
      throw new AppError(400, "INVALID_EVIDENCE_TYPE");
    }
    if (
      (dto.evidenceType === "CONTRACT" || dto.evidenceType === "LEGAL") &&
      (!dto.evidenceUrl || dto.evidenceUrl.trim().length === 0)
    ) {
      throw new AppError(400, "EVIDENCE_URL_REQUIRED");
    }
    if (!(dto.effectiveDate instanceof Date) || Number.isNaN(dto.effectiveDate.getTime())) {
      throw new AppError(400, "INVALID_EFFECTIVE_DATE");
    }

    const plan = await this.prisma.budgetCategoryPlan.findUnique({
      where: { id: categoryPlanId },
      select: { id: true, mandatoryMinimum: true },
    });
    if (!plan) throw new AppError(404, "CATEGORY_PLAN_NOT_FOUND");

    const previousAmount = plan.mandatoryMinimum;
    const now = new Date();

    const [, created] = await this.prisma.$transaction([
      // 같은 카테고리의 기존 PENDING 자동 CANCELED (grill Q5)
      this.prisma.mandatoryMinimumChangeLog.updateMany({
        where: { categoryPlanId, status: "PENDING" },
        data: { status: "CANCELED", reviewedAt: now },
      }),
      this.prisma.mandatoryMinimumChangeLog.create({
        data: {
          categoryPlanId,
          previousAmount,
          newAmount: dto.newAmount,
          evidenceType: dto.evidenceType,
          evidenceUrl: dto.evidenceUrl?.trim() || null,
          reason: dto.reason.trim(),
          effectiveDate: dto.effectiveDate,
          status: "PENDING",
          proposedById: actorId,
        },
        include: {
          proposedBy: { select: USER_BASIC_SELECT },
          ...CATEGORY_SELECT,
        },
      }),
    ]);

    return created;
  }

  /**
   * GM review. PENDING → APPROVED/REJECTED.
   * APPROVED 시 categoryPlan.mandatoryMinimum = log.newAmount 즉시 반영 (grill Q9).
   */
  async review(
    logId: number,
    decision: ReviewDecision,
    note: string | undefined,
    actorId: string,
  ) {
    if (decision !== "APPROVED" && decision !== "REJECTED") {
      throw new AppError(400, "DECISION_MUST_BE_APPROVED_OR_REJECTED");
    }
    if (decision === "REJECTED" && (!note || note.trim().length === 0)) {
      throw new AppError(400, "REVIEW_NOTE_REQUIRED_FOR_REJECT");
    }

    const log = await this.prisma.mandatoryMinimumChangeLog.findUnique({
      where: { id: logId },
      select: {
        id: true,
        status: true,
        categoryPlanId: true,
        newAmount: true,
        // #449 B3: post-tx 알림용 seasonId 필요 (financialReport → seasonId)
        categoryPlan: {
          select: {
            financialReport: { select: { seasonId: true } },
          },
        },
      },
    });
    if (!log) throw new AppError(404, "LOG_NOT_FOUND");
    if (log.status !== "PENDING") throw new AppError(409, "ALREADY_REVIEWED");

    const now = new Date();
    const nextStatus: MinimumChangeStatus = decision;
    const reviewNote = note?.trim() ? note.trim() : null;

    if (decision === "REJECTED") {
      const updated = await this.prisma.mandatoryMinimumChangeLog.update({
        where: { id: logId },
        data: {
          status: nextStatus,
          reviewedById: actorId,
          reviewedAt: now,
          reviewNote,
        },
        include: {
          proposedBy: { select: USER_BASIC_SELECT },
          reviewedBy: { select: USER_BASIC_SELECT },
          ...CATEGORY_SELECT,
        },
      });
      return updated;
    }

    // APPROVED: log + categoryPlan.mandatoryMinimum 동시 반영 (grill Q9)
    const [updated] = await this.prisma.$transaction([
      this.prisma.mandatoryMinimumChangeLog.update({
        where: { id: logId },
        data: {
          status: nextStatus,
          reviewedById: actorId,
          reviewedAt: now,
          reviewNote,
        },
        include: {
          proposedBy: { select: USER_BASIC_SELECT },
          reviewedBy: { select: USER_BASIC_SELECT },
          ...CATEGORY_SELECT,
        },
      }),
      this.prisma.budgetCategoryPlan.update({
        where: { id: log.categoryPlanId },
        data: { mandatoryMinimum: log.newAmount },
      }),
    ]);

    // #449 B3: tx commit 후 fire-and-forget — Basic < newAmount 이면 GM 재편성 요청 알림.
    // 예외는 review() 성공을 막지 않는다 (내부에서도 try/catch 로 로깅).
    const seasonId = log.categoryPlan?.financialReport?.seasonId;
    if (this.violationNotifier && seasonId != null) {
      try {
        const detection = await detectMinimumViolation(
          this.prisma,
          log.categoryPlanId,
        );
        await this.violationNotifier(seasonId, log.categoryPlanId, detection);
      } catch (err) {
        console.error("[mm] post-review violation notify failed", err);
      }
    }

    return updated;
  }

  /**
   * 특정 categoryPlan 이력 (proposedAt DESC).
   * 읽기 권한: FM / GM / SUPER_ADMIN (grill Q6). 컨트롤러에서도 재확인.
   */
  async listHistory(
    categoryPlanId: string,
    actorRole: string,
    actorFrontOfficeRole: string | null | undefined,
  ) {
    if (!this.canRead(actorRole, actorFrontOfficeRole)) {
      throw new AppError(403, "FORBIDDEN");
    }
    return this.prisma.mandatoryMinimumChangeLog.findMany({
      where: { categoryPlanId },
      orderBy: { proposedAt: "desc" },
      include: {
        proposedBy: { select: USER_ROLE_SELECT },
        reviewedBy: { select: USER_ROLE_SELECT },
        ...CATEGORY_SELECT,
      },
    });
  }

  /**
   * seasonId 기준 PENDING 목록 (GM 검토 대기함용).
   * 읽기 권한: FM / GM (SUPER_ADMIN 은 별도 UI 없음 — spec).
   */
  async listPending(
    seasonId: number,
    actorRole: string,
    actorFrontOfficeRole: string | null | undefined,
  ) {
    if (!this.canReadPending(actorRole, actorFrontOfficeRole)) {
      throw new AppError(403, "FORBIDDEN");
    }
    const report = await this.prisma.financialReport.findUnique({
      where: { seasonId },
      select: { id: true },
    });
    if (!report) return [];

    return this.prisma.mandatoryMinimumChangeLog.findMany({
      where: {
        status: "PENDING",
        categoryPlan: { financialReportId: report.id },
      },
      orderBy: { proposedAt: "asc" },
      include: {
        proposedBy: { select: USER_BASIC_SELECT },
        ...CATEGORY_SELECT,
      },
    });
  }

  private canRead(role: string, foRole: string | null | undefined): boolean {
    return (
      role === "SUPER_ADMIN" ||
      role === "GM" ||
      (role === "FRONT_OFFICE" && foRole === "FINANCE_MANAGER")
    );
  }

  private canReadPending(role: string, foRole: string | null | undefined): boolean {
    return (
      role === "GM" ||
      (role === "FRONT_OFFICE" && foRole === "FINANCE_MANAGER")
    );
  }
}
