export interface CoachingStaffEval {
  id: number
  staffUserId: string
  evaluatorId: string
  score: number
  comment: string | null
  evaluatedAt: string
  evaluator: {
    id: number
    nickname: string
    coachingRole: string | null
  }
}
