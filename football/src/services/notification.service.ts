import { api } from './api'

export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string
  readAt: string | null
  createdAt: string
  entityId?: number
  entityIdStr?: string
}

export type NotificationRoute = string | ((entityId: number) => string)

export const NOTIFICATION_ROUTES: Record<string, NotificationRoute> = {
  // Contracts
  CONTRACT_EXPIRY: '/contracts',
  CONTRACT_EXPIRY_90D: '/contracts',
  CONTRACT_EXPIRY_60D: '/contracts',
  CONTRACT_EXPIRY_30D: '/contracts',
  PERFORMANCE_BONUS_ACHIEVED: '/contracts',
  EXTENSION_OPTION_AVAILABLE: '/contracts',
  PLAYER_CONTRACT_SIGNED: '/contracts',
  // Injuries
  INJURY_OCCURRED: '/injuries',
  INJURY_READY_TO_RETURN: '/injuries',
  INJURY_RETURNED: '/injuries',
  // Transfers / Callups
  LOAN_OUT_EXPIRED: '/transfers',
  CALLUP_REQUESTED: '/player-callups',
  CALLUP_APPROVED: '/player-callups',
  CALLUP_REJECTED: '/player-callups',
  CALLUP_DOCS_READY: '/player-callups',
  // Training
  TRAINING_ATTENDANCE_WARNING: '/training/attendance',
  TRAINING_SESSION_PENDING: '/training',
  TRAINING_LOAD_ALERT: '/training',
  ATTENDANCE_PENALTY: '/training/attendance',
  ATTENDANCE_UNAUTHORIZED: '/training/attendance',
  ATTENDANCE_PENALTY_PLAYER: '/training/attendance',
  VIDEO_ASSIGNED: '/training/videos',
  VIDEO_ASSIGNMENT_OVERDUE: '/training/videos',
  // Matches / Tactical
  TACTICAL_ANALYSIS_CONFIRM_REQUESTED: '/matches/analysis',
  MATCH_DAY_REMINDER: '/matches',
  // Equipment
  EQUIPMENT_LOW_STOCK: '/equipment',
  // Reports
  EXTERNAL_REPORT_CREATED: '/reports',
  EXTERNAL_REPORT_DUE_SOON: '/reports',
  EXTERNAL_REPORT_OVERDUE: '/reports',
  REPORT_SUBMITTED: '/reports',
  REPORT_REJECTED: '/reports',
  // Medical expenses
  MEDICAL_EXPENSE_SUBMITTED: '/medical-expenses',
  MEDICAL_EXPENSE_LEADER_APPROVED: '/medical-expenses',
  MEDICAL_EXPENSE_REJECTED: '/medical-expenses',
  MEDICAL_EXPENSE_APPROVED: '/medical-expenses',
  // Coaches
  COACH_AUTO_SHORTLISTED: '/coaches',
  COACH_MANUALLY_SHORTLISTED: '/coaches',
  COACH_SHORTLISTED: '/coaches',
  COACH_APPROVAL_REQUESTED: '/coaches',
  COACH_APPROVAL_PENDING: '/coaches',
  COACH_CONTRACTED: '/coaches',
  COACH_HEAD_CONTRACTED: '/coaches',
  COACH_ARCHIVED: '/coaches',
  COACH_TUTOR_SUPPORT_NEEDED: '/coaches',
  // Players / Squad
  SQUAD_DEPTH_LOW: '/squad',
  JERSEY_NUMBER_CONFLICT: '/squad',
  PLAYER_DEVELOPMENT_PLAN_ACTIVATED: '/players',
  WORK_PERMIT_EXPIRY_SOON: '/players',
  // Youth
  YOUTH_REGISTRATION_STATUS_CHANGED: '/youth-registrations',
  YOUTH_WEEKLY_SCHEDULE: '/training',
  YOUTH_SESSION_CHANGED: '/training',
  INCIDENT_REPORT_SUBMITTED: '/incident-reports',
  GROWTH_REPORT_PUBLISHED: '/growth-reports',
  FEE_INVOICE_ISSUED: '/academy-fees',
  FEE_REMINDER: '/academy-fees',
  FEE_OVERDUE_WARNING: '/academy-fees',
  FEE_ACCOUNT_LOCKED: '/academy-fees',
  // Safety
  SAFEGUARD_EMERGENCY: '/safeguard-reports',
  // Recruitment / Hiring
  HIRING_SURVEY_OPEN: '/admin/recruitment/surveys',
  HIRING_SURVEY_DEADLINE_REMINDER: '/admin/recruitment/surveys',
  HIRING_SURVEY_CLOSED: '/admin/recruitment/surveys',
  HIRING_SURVEY_ALL_RESPONDED: '/admin/recruitment/surveys',
  HIRING_SURVEY_DRAFT_CREATED: (entityId: number) => `/admin/recruitment/surveys/${entityId}/edit`,
  HIRING_PLAN_APPROVED: '/admin/recruitment',
  JOB_POSTING_DRAFT_CREATED: '/admin/recruitment/postings',
  INTERVIEW_SCHEDULED: '/admin/recruitment/applications',
  ONBOARDED: '/admin/recruitment/applications',
  // Hiring Dispatch
  HIRING_DISPATCH_CREATED: '/hiring/approval',
  HIRING_DISPATCH_BUDGET_REVERIFIED: '/hiring/approval',
  HIRING_DISPATCH_DISPATCH_APPROVED: '/hiring/approval',
  HIRING_DISPATCH_DISPATCHED: '/hiring',
  HIRING_DISPATCH_REJECTED: '/hiring',
  HIRING_DISPATCH_CANCELLED: '/hiring',
  HIRING_DISPATCH_PERMISSION_REQUESTED: '/hiring/approval',
  // Asset Request
  ASSET_REQUEST_SUBMITTED: '/asset/approval',
  ASSET_REQUEST_LEADER_APPROVED: '/asset/approval',
  ASSET_REQUEST_LEADER_REJECTED: '/asset/request',
  ASSET_REQUEST_APPROVED: '/asset/request',
  ASSET_REQUEST_REJECTED: '/asset/request',
  ASSET_REQUEST_FULFILLED: '/asset/request',
  // Recruitment — Offer 3-stage approval (#370)
  OFFER_APPROVAL_REQUESTED_LEADER: '/recruitment/offer-approval',
  OFFER_APPROVAL_REQUESTED_DEPT_HEAD: '/recruitment/offer-approval',
  OFFER_APPROVAL_REQUESTED_HR: '/recruitment/offer-approval',
  // 선수 영입 수요조사 (#494)
  ACQUISITION_SURVEY_PUBLISHED: (entityId: number) => `/acquisition-surveys/${entityId}`,
  ACQUISITION_SURVEY_CLOSED: (entityId: number) => `/acquisition-surveys/${entityId}`,
}

export const notificationApi = {
  my: () => api.get<NotificationItem[]>('/notifications/my'),
  markRead: (id: string) => api.patch<void>(`/notifications/${id}/read`, {}),
}
