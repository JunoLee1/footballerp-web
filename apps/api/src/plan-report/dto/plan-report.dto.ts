export type PlanTemplateType = 'GENERAL' | 'HR' | 'MARKETING' | 'GOODS' | 'SQUAD' | 'MEDICAL' | 'IT'
export type ApproverLevel = 'HEAD' | 'GM' | 'ADMIN'

export interface CreatePlanReportDto {
  title: string
  purpose: string
  departmentId: string
  startDate: string
  endDate: string
  budget: number
  expectedEffect: string
  risks: string
  attachments?: string[]
  resultDueDate: string
  templateType: PlanTemplateType
  extraFields?: Record<string, unknown>
  hasNewStaff?: boolean
  hasContract?: boolean
  hasExternalLease?: boolean
  hasPersonalInfo?: boolean
  isNewBusiness?: boolean
}

export interface UpdatePlanReportDto {
  title?: string
  purpose?: string
  departmentId?: string
  startDate?: string
  endDate?: string
  budget?: number
  expectedEffect?: string
  risks?: string
  attachments?: string[]
  resultDueDate?: string
  templateType?: PlanTemplateType
  extraFields?: Record<string, unknown> | null
  hasNewStaff?: boolean
  hasContract?: boolean
  hasExternalLease?: boolean
  hasPersonalInfo?: boolean
  isNewBusiness?: boolean
}

export interface SubmitResultDto {
  resultContent: string
}

export interface RejectPlanReportDto {
  reason: string
}

export interface ListPlanReportQuery {
  templateType?: string
  departmentId?: string
  status?: string
}
