import type {
  PrismaClient,
  JobApplicationOfferApprovalStage,
  JobApplicationOfferApprovalAction,
} from "../generated/client";
import type {
  CreateJobPostingDto,
  UpdateJobPostingDto,
  JobPostingListQuery,
  CreateJobApplicationDto,
  UpdateJobApplicationDto,
  CreateInterviewDto,
  UpdateInterviewDto,
  CreateReferenceCheckDto,
  UpdateReferenceCheckDto,
} from "./dto/recruitment.dto";
import type { InterviewRound, JobApplicationStatus } from "../generated/enums";
import { writeAuditLog } from "../lib/auditLog";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

const POSTING_INCLUDE = {
  department: { select: { id: true, name: true } },
  createdBy: { select: { id: true, username: true } },
  approvedBy: { select: { id: true, username: true } },
  applications: { select: { id: true } },
} as const;

// Include the posting.department so approval-flow callers can resolve
// leader (UserDepartment.role='LEADER') and dept-head (Department.headId)
// without a second query. offerApprovals is ordered by createdAt so the
// timeline (팀장 → 부서장 → HR) reads naturally.
const APPLICATION_INCLUDE = {
  posting: {
    select: {
      id: true,
      title: true,
      hiringPlanItemId: true,
      departmentId: true,
      department: { select: { id: true, name: true, headId: true } },
    },
  },
  offeredBy: { select: { id: true, username: true } },
  interviews: { orderBy: { round: "asc" as const } },
  referenceCheck: true,
  onboarding: {
    include: { user: { select: { id: true, username: true, email: true } } },
  },
  offerApprovals: {
    orderBy: { createdAt: "asc" as const },
    include: { reviewer: { select: { id: true, username: true, nickname: true } } },
  },
} as const;

export class RecruitmentRepository {
  constructor(private prisma: PrismaClient) {}

  // --- JobPosting ---

  findAllPostings(query: JobPostingListQuery) {
    return this.prisma.jobPosting.findMany({
      where: { ...(query.status && { status: query.status }) },
      include: POSTING_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  findPostingById(id: string) {
    return this.prisma.jobPosting.findUnique({ where: { id }, include: POSTING_INCLUDE });
  }

  createPosting(data: CreateJobPostingDto & { createdById: string }) {
    return this.prisma.jobPosting.create({ data, include: POSTING_INCLUDE });
  }

  updatePosting(id: string, data: UpdateJobPostingDto) {
    return this.prisma.jobPosting.update({ where: { id }, data, include: POSTING_INCLUDE });
  }

  approvePosting(id: string, approvedById: string) {
    return this.prisma.jobPosting.update({
      where: { id },
      data: { status: "OPEN", approvedById, approvedAt: new Date() },
      include: POSTING_INCLUDE,
    });
  }

  closePosting(id: string) {
    return this.prisma.jobPosting.update({
      where: { id },
      data: { status: "CLOSED", closedAt: new Date() },
      include: POSTING_INCLUDE,
    });
  }

  // --- JobApplication ---

  findApplicationsByPosting(postingId: string) {
    return this.prisma.jobApplication.findMany({
      where: { postingId },
      include: APPLICATION_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  findApplicationById(id: string) {
    return this.prisma.jobApplication.findUnique({ where: { id }, include: APPLICATION_INCLUDE });
  }

  findApplicationByEmail(postingId: string, email: string) {
    return this.prisma.jobApplication.findUnique({
      where: { postingId_email: { postingId, email } },
    });
  }

  createApplication(postingId: string, data: CreateJobApplicationDto) {
    return this.prisma.jobApplication.create({
      data: { ...data, postingId },
      include: APPLICATION_INCLUDE,
    });
  }

  updateApplication(id: string, data: UpdateJobApplicationDto) {
    return this.prisma.jobApplication.update({
      where: { id },
      data,
      include: APPLICATION_INCLUDE,
    });
  }

  async rejectApplication(id: string, actorId: string) {
    const current = await this.prisma.jobApplication.findUnique({
      where: { id },
      select: { status: true },
    });
    // CL6: set data retention deadline to 1 year from now
    const retentionDeadline = new Date();
    retentionDeadline.setFullYear(retentionDeadline.getFullYear() + 1);

    const result = await this.prisma.jobApplication.update({
      where: { id },
      data: {
        status: "REJECTED",
        previousStatus: current!.status,
        rejectedAt: new Date(),
        dataRetentionDeadline: retentionDeadline,
      } as any,
      include: APPLICATION_INCLUDE,
    });
    void writeAuditLog({
      actorId,
      action: "JOB_APPLICATION_STATUS_CHANGED",
      targetId: id,
      detail: { newStatus: "REJECTED", dataRetentionDeadline: retentionDeadline.toISOString() },
    }).catch(console.error);
    return result;
  }

  async reinstateApplication(id: string, actorId: string) {
    const app = await this.prisma.jobApplication.findUnique({
      where: { id },
      select: { previousStatus: true },
    });
    const result = await this.prisma.jobApplication.update({
      where: { id },
      data: {
        status: app!.previousStatus as any,
        previousStatus: null,
        rejectedAt: null,
        rejectionReason: null,
        dataRetentionDeadline: null,
        // 재심사 강제: reinstate 시 screening 결과 초기화
        screeningResult: "PENDING",
        screeningNotes: null,
        screenedById: null,
        screenedAt: null,
      },
      include: APPLICATION_INCLUDE,
    });
    void writeAuditLog({
      actorId,
      action: "JOB_APPLICATION_STATUS_CHANGED",
      targetId: id,
      detail: { newStatus: app!.previousStatus, reinstated: true },
    }).catch(console.error);
    return result;
  }

  async screenApplication(
    id: string,
    data: {
      screeningResult: "PENDING" | "PASS" | "FAIL";
      screeningNotes: string | null;
      screenedById: string;
      screenedAt: Date;
    },
  ) {
    const result = await this.prisma.jobApplication.update({
      where: { id },
      data,
      include: APPLICATION_INCLUDE,
    });
    void writeAuditLog({
      actorId: data.screenedById,
      action: "JOB_APPLICATION_SCREENED",
      targetId: id,
      detail: { screeningResult: data.screeningResult },
    }).catch(console.error);
    return result;
  }

  async offerApplication(id: string, offeredById: string, actorId: string) {
    const result = await this.prisma.jobApplication.update({
      where: { id },
      data: { status: "OFFERED", offeredAt: new Date(), offeredById },
      include: APPLICATION_INCLUDE,
    });
    void writeAuditLog({
      actorId,
      action: "JOB_APPLICATION_STATUS_CHANGED",
      targetId: id,
      detail: { newStatus: "OFFERED" },
    }).catch(console.error);
    return result;
  }

  async completeOnboarding(id: string, actorId: string) {
    const result = await this.prisma.jobApplication.update({
      where: { id },
      data: { status: "ONBOARDED" },
      include: APPLICATION_INCLUDE,
    });
    void writeAuditLog({
      actorId,
      action: "JOB_APPLICATION_STATUS_CHANGED",
      targetId: id,
      detail: { newStatus: "ONBOARDED" },
    }).catch(console.error);
    return result;
  }

  async setApplicationStatus(id: string, status: JobApplicationStatus, actorId?: string) {
    const result = await this.prisma.jobApplication.update({
      where: { id },
      data: { status },
      include: APPLICATION_INCLUDE,
    });
    if (actorId != null) {
      void writeAuditLog({
        actorId,
        action: "JOB_APPLICATION_STATUS_CHANGED",
        targetId: id,
        detail: { newStatus: status },
      }).catch(console.error);
    }
    return result;
  }

  // --- Interview ---

  findInterview(applicationId: string, round: InterviewRound) {
    return this.prisma.interview.findUnique({
      where: { applicationId_round: { applicationId, round } },
    });
  }

  createInterview(applicationId: string, data: CreateInterviewDto) {
    return this.prisma.interview.create({
      data: {
        applicationId,
        round: data.round,
        ...(data.scheduledAt && { scheduledAt: new Date(data.scheduledAt) }),
        ...(data.interviewerIds && { interviewerIds: data.interviewerIds }),
      },
    });
  }

  updateInterview(applicationId: string, round: InterviewRound, data: UpdateInterviewDto) {
    return this.prisma.interview.update({
      where: { applicationId_round: { applicationId, round } },
      data: {
        ...(data.scheduledAt && { scheduledAt: new Date(data.scheduledAt) }),
        ...(data.interviewerIds && { interviewerIds: data.interviewerIds }),
        ...(data.scoreSkill != null && { scoreSkill: data.scoreSkill }),
        ...(data.scoreComm != null && { scoreComm: data.scoreComm }),
        ...(data.scoreCulture != null && { scoreCulture: data.scoreCulture }),
        ...(data.comment != null && { comment: data.comment }),
        ...(data.result && { result: data.result }),
      },
    });
  }

  // --- ReferenceCheck ---

  createReferenceCheck(applicationId: string, data: CreateReferenceCheckDto) {
    return this.prisma.referenceCheck.create({ data: { ...data, applicationId } });
  }

  updateReferenceCheck(applicationId: string, data: UpdateReferenceCheckDto) {
    return this.prisma.referenceCheck.update({
      where: { applicationId },
      data,
    });
  }

  // --- Onboarding ---

  createOnboarding(applicationId: string, userId: string, otpCode: string, otpExpiresAt: Date) {
    return this.prisma.onboarding.create({
      data: { applicationId, userId, otpCode, otpExpiresAt },
    });
  }

  findOnboardingByApplication(applicationId: string) {
    return this.prisma.onboarding.findUnique({
      where: { applicationId },
      include: { user: { select: { id: true, email: true } } },
    });
  }

  markEmailVerified(applicationId: string) {
    return this.prisma.onboarding.update({
      where: { applicationId },
      data: { emailVerifiedAt: new Date() },
    });
  }

  markMfaRegistered(applicationId: string) {
    return this.prisma.onboarding.update({
      where: { applicationId },
      data: { mfaRegisteredAt: new Date(), completedAt: new Date() },
    });
  }

  // #533 safety net: onboarding 완료 시점에 UserDepartment 존재 확인.
  // 이미 있으면 그대로 유지 (role 변경 없음), 없으면 MEMBER 로 신규 생성.
  // hiring-dispatch 경로는 이미 create 하므로 이 upsert 는 no-op 이지만,
  // application-based (invite → startOnboarding → completeMfa) 경로에서는
  // 최초 배정이 됨.
  ensureUserDepartment(userId: string, departmentId: string) {
    return this.prisma.userDepartment.upsert({
      where: { userId_departmentId: { userId, departmentId } },
      create: { userId, departmentId, role: "MEMBER" },
      update: {},
    });
  }

  async getHeadcountProgress() {
    const postings = await this.prisma.jobPosting.findMany({
      where: { status: { in: ["OPEN", "CLOSED"] } },
      select: {
        id: true,
        title: true,
        headcount: true,
        status: true,
        _count: { select: { applications: { where: { status: "ONBOARDED" } } } },
      },
    });
    return postings.map((p) => ({
      postingId: p.id,
      title: p.title,
      targetHeadcount: p.headcount,
      hiredCount: p._count.applications,
      fillRate: p.headcount === 0 ? 0 : Math.round((p._count.applications / p.headcount) * 100),
      status: p.status,
    }));
  }

  async getTimeToHireStats() {
    const hired = await this.prisma.jobApplication.findMany({
      where: { status: "ONBOARDED", offeredAt: { not: null } },
      select: { createdAt: true, offeredAt: true, posting: { select: { title: true } } },
    });
    const stats = hired.map((a) => ({
      title: a.posting.title,
      daysToHire: Math.round((a.offeredAt!.getTime() - a.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
    }));
    const avg = stats.length === 0 ? 0 : Math.round(stats.reduce((s, v) => s + v.daysToHire, 0) / stats.length);
    return { averageDaysToHire: avg, records: stats };
  }

  // --- KPI ---

  async getCostPerHire() {
    const postings = await this.prisma.jobPosting.findMany({
      select: {
        id: true, title: true, budget: true,
        applications: { select: { status: true } },
      },
    });
    return postings.map(p => {
      const hiredCount = p.applications.filter(a => a.status === 'ONBOARDED').length;
      const budget = p.budget ?? 0;
      return {
        postingId: p.id, title: p.title, budget,
        hiredCount,
        costPerHire: hiredCount > 0 ? Math.round(budget / hiredCount) : 0,
      };
    });
  }

  // --- InterviewerScore ---

  async addInterviewerScore(data: { interviewId: number; interviewerId: string; scoreSkill?: number; scoreComm?: number; scoreCulture?: number; comment?: string }, actorId: string) {
    const result = await this.prisma.interviewerScore.create({ data });
    void writeAuditLog({
      actorId,
      action: "INTERVIEW_SCORE_RECORDED",
      targetId: data.interviewId,
      detail: {
        interviewerId: data.interviewerId,
        scoreSkill: data.scoreSkill,
        scoreComm: data.scoreComm,
        scoreCulture: data.scoreCulture,
      },
    }).catch(console.error);
    return result;
  }

  getInterviewerScores(interviewId: number) {
    return this.prisma.interviewerScore.findMany({
      where: { interviewId },
      include: { interviewer: { select: { id: true, nickname: true } } },
    });
  }

  aggregateInterviewerScores(interviewId: number) {
    return this.prisma.interviewerScore.aggregate({
      where: { interviewId },
      _avg: { scoreSkill: true, scoreComm: true, scoreCulture: true },
      _count: true,
    });
  }

  // --- ClubSettings + Waitlist helpers (fix #366) ---

  getClubSettings() {
    return this.prisma.clubSettings.findFirst();
  }

  findWaitlistedInterviews(postingId: string) {
    return this.prisma.interview.findMany({
      where: {
        result: "WAITLIST",
        application: { postingId },
      },
      include: {
        application: {
          select: { id: true, applicantName: true, email: true, status: true, postingId: true },
        },
      },
    });
  }

  findWaitlistedInterviewByApplication(applicationId: string) {
    return this.prisma.interview.findFirst({
      where: {
        applicationId,
        result: "WAITLIST",
      },
    });
  }

  async findTopWaitlistForPosting(postingId: string) {
    const rows = await this.prisma.interview.findMany({
      where: {
        result: "WAITLIST",
        application: { postingId, status: { not: "REJECTED" } },
      },
      include: {
        application: {
          select: { id: true, applicantName: true, email: true, status: true, postingId: true },
        },
      },
    });
    // Sort by score sum desc in JS (Prisma doesn't support computed ORDER BY easily).
    const sorted = rows.sort((a, b) => {
      const sumA = (a.scoreSkill ?? 0) + (a.scoreComm ?? 0) + (a.scoreCulture ?? 0);
      const sumB = (b.scoreSkill ?? 0) + (b.scoreComm ?? 0) + (b.scoreCulture ?? 0);
      return sumB - sumA;
    });
    return sorted[0] ?? null;
  }

  findAllWaitlistedInterviews() {
    return this.prisma.interview.findMany({
      where: { result: "WAITLIST" },
    });
  }

  updateInterviewResult(id: number, result: "PENDING" | "PASS" | "FAIL" | "HOLD" | "WAITLIST") {
    return this.prisma.interview.update({
      where: { id },
      data: { result },
    });
  }

  // --- Offer 3-stage approval (fix #370) ---
  //
  // Bottom-up flow: 팀장 (LEADER, UserDepartment.role='LEADER' in posting dept)
  //                 → 부서장 (DEPT_HEAD, posting.department.headId)
  //                 → HR (canWriteHR user).
  // Status transitions live in the service; this repo only writes the
  // approval trail row and the status column. addOfferApproval accepts an
  // optional `tx?` so the service can wrap approval-row + status update in
  // a single transaction (AssetRequest 패턴).

  /**
   * Resolves the leader of a department. LEADER = UserDepartment.role='LEADER'.
   * Returns the most recently joined leader if multiple exist (defensive —
   * schema doesn't enforce uniqueness). null if no leader is assigned.
   */
  async findDepartmentLeader(departmentId: string) {
    const membership = await this.prisma.userDepartment.findFirst({
      where: { departmentId, role: "LEADER" },
      orderBy: { joinedAt: "desc" },
      select: { userId: true },
    });
    return membership?.userId ?? null;
  }

  addOfferApproval(
    applicationId: string,
    data: {
      stage: JobApplicationOfferApprovalStage;
      action: JobApplicationOfferApprovalAction;
      reviewerId: string;
      reason?: string;
    },
    tx?: Tx,
  ) {
    const client = tx ?? this.prisma;
    return client.jobApplicationOfferApproval.create({
      data: {
        applicationId,
        stage: data.stage,
        action: data.action,
        reviewerId: data.reviewerId,
        ...(data.reason !== undefined && { reason: data.reason }),
      },
    });
  }

  updateApplicationStatusInTx(
    id: string,
    status: JobApplicationStatus,
    tx?: Tx,
  ) {
    const client = tx ?? this.prisma;
    return client.jobApplication.update({
      where: { id },
      data: { status },
      include: APPLICATION_INCLUDE,
    });
  }

  /**
   * OFFER_PENDING_LEADER — user is the LEADER of the posting's department.
   */
  findApplicationsPendingLeader(userId: string) {
    return this.prisma.jobApplication.findMany({
      where: {
        status: "OFFER_PENDING_LEADER",
        posting: {
          department: {
            members: { some: { userId, role: "LEADER" } },
          },
        },
      },
      include: APPLICATION_INCLUDE,
      orderBy: { updatedAt: "desc" },
    });
  }

  /**
   * OFFER_PENDING_DEPT_HEAD — user is the head of the posting's department.
   */
  findApplicationsPendingDeptHead(userId: string) {
    return this.prisma.jobApplication.findMany({
      where: {
        status: "OFFER_PENDING_DEPT_HEAD",
        posting: { department: { headId: userId } },
      },
      include: APPLICATION_INCLUDE,
      orderBy: { updatedAt: "desc" },
    });
  }

  /**
   * OFFER_PENDING_HR — HR queue. Role-gate is enforced at the controller
   * layer (canWriteHR); the repo returns every pending-HR application.
   */
  findApplicationsPendingHr() {
    return this.prisma.jobApplication.findMany({
      where: { status: "OFFER_PENDING_HR" },
      include: APPLICATION_INCLUDE,
      orderBy: { updatedAt: "desc" },
    });
  }
}
