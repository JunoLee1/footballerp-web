export interface CreateSafeguardReportDto {
  description: string
  contactInfo?: string
  accusedUserId?: string
}

export interface UpdateSafeguardStatusDto {
  status: 'UNDER_REVIEW' | 'RESOLVED'
  resolvedNote?: string
}

export function validateCreateSafeguardReport(body: unknown): CreateSafeguardReportDto {
  const b = body as Record<string, unknown>
  if (typeof b.description !== 'string' || b.description.trim().length < 10) {
    throw { statusCode: 400, code: 'INVALID_DESCRIPTION' }
  }
  const dto: CreateSafeguardReportDto = { description: b.description.trim() }
  if (typeof b.contactInfo === 'string') dto.contactInfo = b.contactInfo
  if (typeof b.accusedUserId === 'string') dto.accusedUserId = b.accusedUserId
  return dto
}

export function validateUpdateSafeguardStatus(body: unknown): UpdateSafeguardStatusDto {
  const b = body as Record<string, unknown>
  const VALID = ['UNDER_REVIEW', 'RESOLVED'] as const
  if (!VALID.includes(b.status as any)) {
    throw { statusCode: 400, code: 'INVALID_STATUS' }
  }
  const dto: UpdateSafeguardStatusDto = { status: b.status as 'UNDER_REVIEW' | 'RESOLVED' }
  if (typeof b.resolvedNote === 'string') dto.resolvedNote = b.resolvedNote
  return dto
}
