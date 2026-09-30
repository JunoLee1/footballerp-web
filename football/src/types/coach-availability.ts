export interface CoachAvailability {
  id: number
  userId: string
  startDate: string
  endDate: string
  reason: string | null
  createdById: string
  createdAt: string
  user: { id: number; nickname: string | null; coachingRole: string | null }
}

export interface CreateCoachAvailabilityPayload {
  userId: string
  startDate: string
  endDate: string
  reason?: string
}
