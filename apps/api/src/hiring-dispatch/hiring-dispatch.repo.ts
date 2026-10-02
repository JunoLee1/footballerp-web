import {
  PrismaClient,
  HiringDispatchStatus,
  HiringDispatchStage,
  HiringDispatchAction,
  Prisma,
} from "../generated/client";
import { CreateHiringDispatchDto } from "./dto/hiring-dispatch.dto";

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const detailInclude = {
  application: {
    select: {
      id: true,
      applicantName: true,
      email: true,
      status: true,
      postingId: true,
      posting: {
        select: {
          id: true,
          title: true,
          headcount: true,
          hiringPlanItemId: true,
          // Q10 — gate needs the posting's requiredDocuments to know what
          // must be APPROVED before EXECUTION.
          requiredDocuments: true,
          hiringPlanItem: {
            select: { id: true, roleTitle: true, headcount: true },
          },
        },
      },
    },
  },
  department: {
    select: {
      id: true,
      name: true,
      headId: true,
      parentId: true,
      parent: { select: { id: true, name: true, headId: true } },
    },
  },
  createdBy: { select: { id: true, username: true, nickname: true } },
  createdUser: { select: { id: true, username: true, nickname: true, email: true } },
  reportsToUser: { select: { id: true, username: true, nickname: true } },
  approvals: {
    orderBy: { createdAt: "asc" as const },
    include: {
      reviewer: { select: { id: true, username: true, nickname: true } },
    },
  },
  onboarding: {
    select: { id: true, otpCode: true, otpExpiresAt: true, completedAt: true },
  },
} as const;

const listInclude = {
  application: { select: { id: true, applicantName: true, email: true } },
  department: { select: { id: true, name: true, headId: true } },
  createdBy: { select: { id: true, username: true, nickname: true } },
} as const;

/**
 * Repository for the 4-stage post-hiring dispatch workflow.
 *
 * Mirrors the asset-request repo shape: create/find helpers + `updateStatus`
 * and `addApproval` accept an optional `tx?` so the service can compose the
 * DISPATCHED $transaction (User + UserDepartment + StaffRecord + Onboarding +
 * status transition) as a single atomic unit.
 */
export class HiringDispatchRepository {
  constructor(private prisma: PrismaClient) {}

  create(dto: CreateHiringDispatchDto, createdById: string) {
    return this.prisma.hiringDispatch.create({
      data: {
        // applicationId is optional — Application-free 임원 스카웃 / 즉시 계약직 case.
        ...(dto.applicationId !== undefined && { applicationId: dto.applicationId }),
        candidateName: dto.candidateName,
        candidateEmail: dto.candidateEmail,
        jobTitle: dto.jobTitle,
        jobGrade: dto.jobGrade,
        employmentType: dto.employmentType,
        departmentId: dto.departmentId,
        ...(dto.reportsToUserId !== undefined && { reportsToUserId: dto.reportsToUserId }),
        monthlySalary: BigInt(dto.monthlySalary),
        startDate: new Date(dto.startDate),
        targetRole: dto.targetRole as any,
        ...(dto.targetFrontOfficeRole !== undefined && {
          targetFrontOfficeRole: dto.targetFrontOfficeRole as any,
        }),
        ...(dto.targetCoachingRole !== undefined && {
          targetCoachingRole: dto.targetCoachingRole as any,
        }),
        ...(dto.permissionNotes !== undefined && { permissionNotes: dto.permissionNotes }),
        ...(dto.requiredDocuments !== undefined && {
          requiredDocuments: dto.requiredDocuments
            .map((s) => s.trim())
            .filter((s) => s.length > 0),
        }),
        status: "CREATED",
        createdById,
      },
      include: listInclude,
    });
  }

  findById(id: string) {
    return this.prisma.hiringDispatch.findUnique({
      where: { id },
      include: detailInclude,
    });
  }

  findByCreator(userId: string, status?: HiringDispatchStatus) {
    return this.prisma.hiringDispatch.findMany({
      where: { createdById: userId, ...(status !== undefined && { status }) },
      include: listInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  findByDepartment(departmentId: string, status?: HiringDispatchStatus) {
    return this.prisma.hiringDispatch.findMany({
      where: { departmentId, ...(status !== undefined && { status }) },
      include: listInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  findAll(status?: HiringDispatchStatus) {
    return this.prisma.hiringDispatch.findMany({
      where: status !== undefined ? { status } : {},
      include: listInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  findPendingForBudget() {
    return this.prisma.hiringDispatch.findMany({
      where: { status: "CREATED" },
      include: listInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  findPendingForDispatch() {
    return this.prisma.hiringDispatch.findMany({
      where: { status: "BUDGET_REVERIFIED" },
      include: listInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  findPendingForExecution() {
    return this.prisma.hiringDispatch.findMany({
      where: { status: "DISPATCH_APPROVED" },
      include: listInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  updateStatus(
    id: string,
    patch: { status: HiringDispatchStatus; createdUserId?: string },
    tx?: Tx,
  ) {
    const client = tx ?? this.prisma;
    return client.hiringDispatch.update({
      where: { id },
      data: {
        status: patch.status,
        ...(patch.createdUserId !== undefined && { createdUserId: patch.createdUserId }),
      },
      include: detailInclude,
    });
  }

  addApproval(
    id: string,
    data: {
      stage: HiringDispatchStage;
      action: HiringDispatchAction;
      reviewerId: string;
      reason?: string | null;
    },
    tx?: Tx,
  ) {
    const client = tx ?? this.prisma;
    return client.hiringDispatchApproval.create({
      data: {
        dispatchId: id,
        stage: data.stage,
        action: data.action,
        reviewerId: data.reviewerId,
        ...(data.reason !== undefined && data.reason !== null && { reason: data.reason }),
      },
    });
  }

  /**
   * Counts current members of a department (UserDepartment rows).
   * Used by the BUDGET_REVERIFIED TO check — if `count + 1 > HiringPlanItem.headcount`
   * we surface a warning that the finance reviewer must explicitly override.
   */
  countDeptMembers(departmentId: string, tx?: Tx) {
    const client = tx ?? this.prisma;
    return client.userDepartment.count({ where: { departmentId } });
  }

  // Exposed so the service can lookup a User by email inside the pre-DISPATCHED
  // check without importing Prisma directly. Kept narrow — only returns id.
  findUserByEmail(email: string, tx?: Tx) {
    const client = tx ?? this.prisma;
    return client.user.findUnique({ where: { email }, select: { id: true } });
  }

  // Prisma createInput shortcut used by dispatch() to build User + PhoneNumber
  // inside the $transaction. Keeps the service testable while still reusing
  // the repo as the sole Prisma boundary.
  createPhoneNumber(data: { encrypted: string; iv: string }, tx?: Tx) {
    const client = tx ?? this.prisma;
    return client.phoneNumber.create({ data });
  }

  createUser(data: Prisma.UserUncheckedCreateInput, tx?: Tx) {
    const client = tx ?? this.prisma;
    return client.user.create({
      data,
      select: { id: true, email: true, username: true, nickname: true, role: true },
    });
  }

  createUserDepartment(data: { userId: string; departmentId: string }, tx?: Tx) {
    const client = tx ?? this.prisma;
    return client.userDepartment.create({
      data: { userId: data.userId, departmentId: data.departmentId, role: "MEMBER" },
    });
  }

  createStaffRecord(
    data: {
      name: string;
      role: string;
      email: string;
      departmentId: string;
      startDate: Date;
      createdById: string;
      // #375: seed probation tracking so the D-7 cron notifier can find the
      // row. Both are required inputs — dispatch() always sets them.
      probationStartedAt: Date;
      probationStatus: "IN_PROGRESS" | "PASSED" | "FAILED";
    }, // TODO: DTO로 파일 옮기기
    tx?: Tx,
  ) {
    const client = tx ?? this.prisma;
    // NOTE: StaffRecord has no direct `userId` column — the linkage back to
    // the auto-provisioned User is via `email` (unique on both StaffRecord
    // and User). A first-class `staffRecord.userId` FK is a follow-up.
    return client.staffRecord.create({
      data: {
        name: data.name,
        role: data.role,
        email: data.email,
        departmentId: data.departmentId,
        employmentStartDate: data.startDate,
        createdById: data.createdById,
        probationStartedAt: data.probationStartedAt,
        probationStatus: data.probationStatus,
      },
    });
  }

  createOnboarding(
    data: { hiringDispatchId: string; userId: string; otpCode: string; otpExpiresAt: Date },
    tx?: Tx,
  ) {
    const client = tx ?? this.prisma;
    return client.onboarding.create({
      data: {
        hiringDispatchId: data.hiringDispatchId,
        userId: data.userId,
        otpCode: data.otpCode,
        otpExpiresAt: data.otpExpiresAt,
      },
    });
  }
}
