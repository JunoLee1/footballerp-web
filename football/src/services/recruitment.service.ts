import { api } from './api'
import type {
  JobPosting,
  JobApplication,
  JobPostingStatus,
  InterviewRound,
  InterviewResult,
  ReferenceCheckResult,
  OfferApprovalStage,
} from '@/types/recruitment'

export interface HeadcountProgressItem {
  postingId: number
  title: string
  targetHeadcount: number
  hiredCount: number
  fillRate: number          // 0-100
  status: string
}

export const recruitmentApi = {
  // JobPostings
  listPostings: (status?: JobPostingStatus): Promise<JobPosting[]> =>
    api.get('/recruitment/job-postings' + (status ? `?status=${status}` : '')),

  getPosting: (id: number): Promise<JobPosting> =>
    api.get(`/recruitment/job-postings/${id}`),

  createPosting: (data: {
    title: string
    description: string
    headcount?: number
    departmentId?: number
    planReportId: number
    hiringPlanItemId: number
    requiredDocuments?: string[]
  }): Promise<JobPosting> =>
    api.post('/recruitment/job-postings', data),

  updatePosting: (id: number, data: {
    title?: string
    description?: string
    headcount?: number
    departmentId?: number | null
    requiredDocuments?: string[]
  }): Promise<JobPosting> =>
    api.patch(`/recruitment/job-postings/${id}`, data),

  approvePosting: (id: number): Promise<JobPosting> =>
    api.post(`/recruitment/job-postings/${id}/approve`, {}),

  closePosting: (id: number): Promise<JobPosting> =>
    api.post(`/recruitment/job-postings/${id}/close`, {}),

  // Applications
  listApplications: (postingId: number): Promise<JobApplication[]> =>
    api.get(`/recruitment/job-postings/${postingId}/applications`),

  getApplication: (id: number): Promise<JobApplication> =>
    api.get(`/recruitment/applications/${id}`),

  rejectApplication: (id: number): Promise<JobApplication> =>
    api.post(`/recruitment/applications/${id}/reject`, {}),

  reinstateApplication: (id: number): Promise<JobApplication> =>
    api.post(`/recruitment/applications/${id}/reinstate`, {}),

  offerApplication: (id: number): Promise<JobApplication> =>
    api.post(`/recruitment/applications/${id}/offer`, {}),

  // Interviews
  scheduleInterview: (appId: number, data: {
    round: InterviewRound
    scheduledAt?: string
    interviewerIds?: number[]
  }): Promise<JobApplication> =>
    api.post(`/recruitment/applications/${appId}/interviews`, data),

  updateInterview: (appId: number, round: InterviewRound, data: {
    scheduledAt?: string
    scoreSkill?: number
    scoreComm?: number
    scoreCulture?: number
    comment?: string
    result?: InterviewResult
  }): Promise<JobApplication> =>
    api.patch(`/recruitment/applications/${appId}/interviews/${round}`, data),

  // Reference check
  createReferenceCheck: (appId: number, data: {
    contactName: string
    relationship: string
    notes?: string
  }): Promise<JobApplication> =>
    api.post(`/recruitment/applications/${appId}/reference-check`, data),

  updateReferenceCheck: (appId: number, data: {
    result: ReferenceCheckResult
    notes?: string
  }): Promise<JobApplication> =>
    api.patch(`/recruitment/applications/${appId}/reference-check`, data),

  // Onboarding
  startOnboarding: (appId: number, userId: string): Promise<JobApplication> =>
    api.post(`/recruitment/applications/${appId}/onboarding`, { userId }),

  verifyEmail: (appId: number, otp: string): Promise<JobApplication> =>
    api.post(`/recruitment/applications/${appId}/onboarding/verify-email`, { otp }),

  completeMfa: (appId: number): Promise<JobApplication> =>
    api.post(`/recruitment/applications/${appId}/onboarding/complete-mfa`, {}),

  headcountProgress: (): Promise<HeadcountProgressItem[]> =>
    api.get('/recruitment/headcount-progress'),

  // --- Offer 3-stage approval (#370) ---

  /**
   * List applications pending my approval at the given stage.
   *   LEADER    — I am the department LEADER (UserDepartment.role='LEADER')
   *   DEPT_HEAD — I am the department head (Department.headId=me)
   *   HR        — I have canWriteHR
   */
  listOfferApprovals: (stage: OfferApprovalStage): Promise<JobApplication[]> =>
    api.get(`/recruitment/applications/offer-approvals/${stage}`),

  offerLeaderApprove: (appId: number): Promise<JobApplication> =>
    api.post(`/recruitment/applications/${appId}/offer-approval/leader-approve`, {}),

  offerLeaderReject: (appId: number, reason: string): Promise<JobApplication> =>
    api.post(`/recruitment/applications/${appId}/offer-approval/leader-reject`, { reason }),

  offerDeptHeadApprove: (appId: number): Promise<JobApplication> =>
    api.post(`/recruitment/applications/${appId}/offer-approval/dept-head-approve`, {}),

  offerDeptHeadReject: (appId: number, reason: string): Promise<JobApplication> =>
    api.post(`/recruitment/applications/${appId}/offer-approval/dept-head-reject`, { reason }),

  offerHrApprove: (appId: number): Promise<JobApplication> =>
    api.post(`/recruitment/applications/${appId}/offer-approval/hr-approve`, {}),

  offerHrReject: (appId: number, reason: string): Promise<JobApplication> =>
    api.post(`/recruitment/applications/${appId}/offer-approval/hr-reject`, { reason }),
}
