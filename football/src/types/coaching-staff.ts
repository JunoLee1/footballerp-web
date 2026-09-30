export type CoachingRole =
  | 'HEAD_COACH'
  | 'ASSISTANT_COACH'
  | 'DEFENSIVE_COACH'
  | 'ATTACKING_COACH'
  | 'GOALKEEPER_COACH'
  | 'PHYSICAL_COACH'
  | 'SET_PIECE_COACH'

export interface StaffAbsence {
  id: number
  startDate: string
  endDate: string
  reason: string | null
  createdById: string
}

export interface CoachingStaffMember {
  id: number
  nickname: string | null
  coachingRole: CoachingRole | null
  teamId: number | null
  coachAvailabilities: StaffAbsence[]
}
