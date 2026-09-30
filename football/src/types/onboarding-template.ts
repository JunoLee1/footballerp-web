export interface OnboardingTemplateTask {
  title: string
  description?: string
  dueDaysFromStart?: number
  requiresVerification: boolean
  optional: boolean
}

export interface OnboardingTemplateAuditUser {
  id: number
  username: string
  nickname: string
}

export interface OnboardingTemplate {
  id: number
  departmentId: number
  name: string
  tasks: OnboardingTemplateTask[]
  createdById: string
  updatedById: string | null
  createdAt: string
  updatedAt: string
  createdBy: OnboardingTemplateAuditUser | null
  updatedBy: OnboardingTemplateAuditUser | null
}

export interface UpsertOnboardingTemplatePayload {
  name: string
  tasks: OnboardingTemplateTask[]
}
