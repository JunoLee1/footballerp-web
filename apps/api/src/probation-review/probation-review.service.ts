import { PrismaClient } from "../generated/client";
import { AppError } from "../lib/appError";
import { writeAuditLog } from "../lib/auditLog";
import { isAdminLike } from "../lib/permissions";
import { NotificationRepository } from "../notification/notification.repo";
import { ProbationReviewRepository } from "./probation-review.repo";
import { SubmitProbationReviewDto } from "./dto/probation-review.dto";

/**
 * ProbationReview — 신규 직원 팔로우업 서비스 (issue #375).
 *
 * Flow:
 *   HiringDispatch.dispatch()  → StaffRecord.probationStartedAt = now, probationStatus = IN_PROGRESS
 *   cron probationReviewNotifier (D-7) → 부서장 알림
 *   POST /staff-records/:id/probation-review → 부서장이 review 제출
 *     - THREE_MO PASSED: 이후 SIX_MO 대기 (probationStatus 유지)
 *     - SIX_MO PASSED   : probationStatus = PASSED, probationEndedAt = now
 *     - 어느 시점 FAILED : probationStatus = FAILED, probationEndedAt = now
 *   FAIL 후 실제 계약해지는 수동 (`StaffRecord.terminate` 기존 로직 재사용)
 *
 * Permissions:
 *   submit: Department.head OR HR_MANAGER OR isAdminLike
 *   list  : submit-권한자 OR HR_STAFF OR self (email match)
 */
export class ProbationReviewService {
  constructor(
    private repo: ProbationReviewRepository,
    private notifRepo: NotificationRepository,
    private prisma: PrismaClient,
  ) {}

  // ────────────────────────────────────────────
  // Submit review
  // ────────────────────────────────────────────

  async submit(
    staffRecordId: number,
    reviewerId: number,
    role: string,
    foRole: string | null | undefined,
    body: SubmitProbationReviewDto,
  ) {
    // Basic input validation before hitting the DB.
    if (body.status !== "PASSED" && body.status !== "FAILED") {
      throw new AppError(400, "INVALID_STATUS");
    }
    if (body.reviewType !== "THREE_MO" && body.reviewType !== "SIX_MO") {
      throw new AppError(400, "INVALID_REVIEW_TYPE");
    }
    const assessment = body.leaderAssessment?.trim();
    if (!assessment) throw new AppError(400, "ASSESSMENT_REQUIRED");

    const staff = await this.repo.findStaffWithDept(staffRecordId);
    if (!staff) throw new AppError(404, "STAFF_RECORD_NOT_FOUND");

    // Permission gate: dept head, HR manager, or admin-like.
    const isDeptHead = staff.department?.headId === reviewerId;
    const isHrManager = role === "FRONT_OFFICE" && foRole === "HR_MANAGER";
    if (!isDeptHead && !isHrManager && !isAdminLike(role)) {
      throw new AppError(403, "NOT_DEPARTMENT_HEAD");
    }

    if (!staff.probationStartedAt) throw new AppError(400, "PROBATION_NOT_STARTED");
    if (staff.probationStatus !== "IN_PROGRESS") {
      throw new AppError(400, "PROBATION_ALREADY_ENDED");
    }

    // Idempotency: a non-PENDING row for this (staff, type) can't be replaced —
    // avoids race between two dept heads. To amend, HR/admin would need a
    // separate override endpoint (out of MVP scope).
    const existing = await this.repo.findReviewByStaffAndType(staffRecordId, body.reviewType);
    if (existing && existing.status !== "PENDING") {
      throw new AppError(400, "REVIEW_ALREADY_COMPLETED");
    }

    const now = new Date();

    // Both writes commit together — a review that transitions probation state
    // must not orphan the staff-side flip on partial failure.
    const shouldEndProbation =
      body.status === "FAILED" || (body.reviewType === "SIX_MO" && body.status === "PASSED");

    const review = await this.prisma.$transaction(async (tx) => {
      const reviewRow = await this.repo.upsertReview(
        {
          staffRecordId,
          reviewType: body.reviewType,
          status: body.status,
          leaderAssessment: assessment,
          reviewedById: reviewerId,
          reviewedAt: now,
        },
        tx,
      );

      if (shouldEndProbation) {
        await this.repo.setStaffProbation(
          staffRecordId,
          {
            probationStatus: body.status === "PASSED" ? "PASSED" : "FAILED",
            probationEndedAt: now,
          },
          tx,
        );
      }
      return reviewRow;
    });

    writeAuditLog({
      actorId: reviewerId,
      action: "PROBATION_REVIEW_SUBMITTED",
      targetId: staffRecordId,
      detail: {
        reviewType: body.reviewType,
        status: body.status,
        endedProbation: shouldEndProbation,
      },
    }).catch(console.error);

    // Fire-and-forget: notify the linked User (staff themselves), if any.
    // A review is informational for the staff — actual termination stays HR.
    const user = await this.repo.findStaffIdByUserEmail(staff.email);
    if (user) {
      void this.notifRepo
        .createForUser(
          user.id,
          "PROBATION_REVIEW_COMPLETED",
          (lang) => ({
            title:
              lang === "en"
                ? "Probation Review Completed"
                : "수습 평가가 등록됐어요",
            body:
              lang === "en"
                ? `Your ${body.reviewType === "THREE_MO" ? "3-month" : "6-month"} probation review was recorded (${body.status}).`
                : `수습 ${body.reviewType === "THREE_MO" ? "3개월" : "6개월"} 평가가 ${body.status === "PASSED" ? "통과" : "미통과"}로 기록됐어요.`,
          }),
          staffRecordId,
        )
        .catch(console.error);
    }

    return review;
  }

  // ────────────────────────────────────────────
  // List reviews
  // ────────────────────────────────────────────

  async list(
    staffRecordId: number,
    reviewerId: number,
    role: string,
    foRole: string | null | undefined,
  ) {
    const staff = await this.repo.findStaffWithDept(staffRecordId);
    if (!staff) throw new AppError(404, "STAFF_RECORD_NOT_FOUND");

    // Read gate: dept head, HR_MANAGER/HR_STAFF, admin-like, or self.
    // #580: 이전 isFrontOffice fallback 이 너무 넓어 (ASSET/FACILITY/TD/FINANCE 등) 전 FO role 통과
    // → 제거. HR 관계자 + dept.head + admin-like + 본인만 허용.
    const isDeptHead = staff.department?.headId === reviewerId;
    const isHR = role === "FRONT_OFFICE" && (foRole === "HR_MANAGER" || foRole === "HR_STAFF");
    const isSelf = !!staff.email && (await this.repo.findStaffIdByUserEmail(staff.email))?.id === reviewerId;
    if (!isDeptHead && !isHR && !isAdminLike(role) && !isSelf) {
      throw new AppError(403, "FORBIDDEN");
    }

    return this.repo.findReviewsForStaff(staffRecordId);
  }
}
