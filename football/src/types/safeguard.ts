export type SafeguardReportStatus = 'RECEIVED' | 'UNDER_REVIEW' | 'RESOLVED'

export interface SafeguardReport {
  id: string
  description: string
  contactInfo: string | null
  accusedUserId: string | null
  accusedUser?: { id: string; username: string; role: string } | null
  status: SafeguardReportStatus
  resolvedNote: string | null
  createdAt: string
}

export interface CreateSafeguardReportPayload {
  description: string
  contactInfo?: string
  accusedUserId?: string
}
