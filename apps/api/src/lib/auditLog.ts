import { getPrisma } from './prisma'

const SENSITIVE_KEYS = [
  'salary',
  'wage',
  'phone',
  'phoneNumber',
  'password',
  'token',
  'emergencyContact',
  'dateOfBirth',
]

function sanitizeDetail(detail: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(detail).map(([k, v]) => {
      const isSensitive = SENSITIVE_KEYS.some(s => k.toLowerCase().includes(s.toLowerCase()))
      return [k, isSensitive ? '[REDACTED]' : v]
    }),
  )
}

export async function writeAuditLog(params: {
  actorId: string
  action: string
  targetId?: string | number
  detail?: Record<string, unknown>
}) {
  const prisma = getPrisma()
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      targetId: params.targetId != null ? String(params.targetId) : null,
      detail: params.detail ? JSON.stringify(sanitizeDetail(params.detail)) : null,
    },
  })
}
