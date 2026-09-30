export type PlanStatus = 'DRAFT' | 'ACTIVE' | 'REVIEWED'

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  REVIEWED: 'Reviewed',
}

export const PLAN_STATUS_STYLE: Record<PlanStatus, string> = {
  DRAFT: 'border-gray-300 text-gray-600 bg-gray-50',
  ACTIVE: 'border-blue-300 text-blue-700 bg-blue-50',
  REVIEWED: 'border-green-300 text-green-700 bg-green-50',
}

export interface DevelopmentPlan {
  id: number
  playerId: string
  coachId: string
  seasonId: number
  goals: string
  notes: string | null
  status: PlanStatus
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
  player: { playerName: string; position: string }
  coach: { id: number; username: string; nickname: string | null }
  season: { id: number; name: string }
}

export interface CreateDevelopmentPlanPayload {
  playerId: string
  seasonId: number
  goals: string
  notes?: string
}

export interface UpdateDevelopmentPlanPayload {
  goals?: string
  notes?: string
}
