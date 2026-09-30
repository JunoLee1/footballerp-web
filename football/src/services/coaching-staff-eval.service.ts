import { api } from './api'
import type { CoachingStaffEval } from '@/types/coaching-staff-eval'

export const coachingStaffEvalApi = {
  list: (staffUserId: string) =>
    api.get<CoachingStaffEval[]>(`/coaching-staff/${staffUserId}/evaluations`),

  create: (staffUserId: string, score: number, comment?: string) =>
    api.post<CoachingStaffEval>(`/coaching-staff/${staffUserId}/evaluations`, { score, comment }),
}
