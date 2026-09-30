import {
  PrismaClient,
  ProbationReviewType,
  ProbationReviewStatus,
  ProbationStatus,
} from "../generated/client";

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Repository for the ProbationReview module (issue #375).
 *
 * `submit` in the service composes upsertReview + setStaffProbation inside a
 * `$transaction`, so both accept an optional `tx` (mirrors hiring-dispatch).
 */
export class ProbationReviewRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Fetches the StaffRecord + minimal Department fields the service needs for
   * both permission checks (`department.headId`) and validation
   * (`probationStartedAt`, `probationStatus`).
   */
  findStaffWithDept(staffRecordId: number) {
    return this.prisma.staffRecord.findUnique({
      where: { id: staffRecordId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        departmentId: true,
        probationStartedAt: true,
        probationEndedAt: true,
        probationStatus: true,
        department: {
          select: { id: true, name: true, headId: true },
        },
      },
    });
  }

  findReviewByStaffAndType(staffRecordId: number, reviewType: ProbationReviewType) {
    return this.prisma.probationReview.findUnique({
      where: {
        staffRecordId_reviewType: { staffRecordId, reviewType },
      },
    });
  }

  findReviewsForStaff(staffRecordId: number) {
    return this.prisma.probationReview.findMany({
      where: { staffRecordId },
      include: {
        reviewedBy: { select: { id: true, username: true, nickname: true } },
      },
      orderBy: [{ reviewType: "asc" }, { createdAt: "asc" }],
    });
  }

  /**
   * Upserts a review row by (staffRecordId, reviewType) — never creates
   * duplicates. Called from the transactional submit path.
   */
  upsertReview(
    args: {
      staffRecordId: number;
      reviewType: ProbationReviewType;
      status: ProbationReviewStatus;
      leaderAssessment: string;
      reviewedById: string;
      reviewedAt: Date;
    },
    tx?: Tx,
  ) {
    const client = tx ?? this.prisma;
    return client.probationReview.upsert({
      where: {
        staffRecordId_reviewType: {
          staffRecordId: args.staffRecordId,
          reviewType: args.reviewType,
        },
      },
      create: {
        staffRecordId: args.staffRecordId,
        reviewType: args.reviewType,
        status: args.status,
        leaderAssessment: args.leaderAssessment,
        reviewedById: args.reviewedById,
        reviewedAt: args.reviewedAt,
      },
      update: {
        status: args.status,
        leaderAssessment: args.leaderAssessment,
        reviewedById: args.reviewedById,
        reviewedAt: args.reviewedAt,
      },
    });
  }

  /**
   * Sets probation status + optional end date on the StaffRecord (used when
   * SIX_MO PASSED or any FAILED is submitted).
   */
  setStaffProbation(
    staffRecordId: number,
    patch: { probationStatus: ProbationStatus; probationEndedAt?: Date },
    tx?: Tx,
  ) {
    const client = tx ?? this.prisma;
    return client.staffRecord.update({
      where: { id: staffRecordId },
      data: {
        probationStatus: patch.probationStatus,
        ...(patch.probationEndedAt && { probationEndedAt: patch.probationEndedAt }),
      },
    });
  }

  /**
   * Looks up a User by the StaffRecord.email (the two are linked by unique
   * email, per HiringDispatch.dispatch()). Returns null if the staff has no
   * associated user (e.g. legacy manually-created rows without email).
   */
  async findStaffIdByUserEmail(email: string | null) {
    if (!email) return null;
    return this.prisma.user.findUnique({ where: { email }, select: { id: true } });
  }
}
