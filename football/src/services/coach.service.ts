import { api } from './api'
import type {
  CoachHiringRound, Coach, TutorAssignment,
  CreateHiringRoundDto, CreateCoachDto, CreateTutorDto,
  CoachStatus, HiringRoundStatus, ShortlistSource,
} from '@/types/coach'

export const coachApi = {
  // HiringRound
  listRounds: () => api.get<CoachHiringRound[]>('/coaches/rounds'),
  createRound: (dto: CreateHiringRoundDto) => api.post<CoachHiringRound>('/coaches/rounds', dto),
  updateRoundStatus: (id: number, status: HiringRoundStatus, result?: string) =>
    api.patch<CoachHiringRound>(`/coaches/rounds/${id}/status`, { status, result }),

  // Coach
  list: (params?: { roundId?: number; status?: CoachStatus }) => {
    const qs = new URLSearchParams()
    if (params?.roundId !== undefined) qs.set('roundId', String(params.roundId))
    if (params?.status) qs.set('status', params.status)
    const q = qs.toString()
    return api.get<Coach[]>(`/coaches${q ? `?${q}` : ''}`)
  },
  create: (dto: CreateCoachDto) => api.post<Coach>('/coaches', dto),
  getById: (id: number) => api.get<Coach>(`/coaches/${id}`),
  update: (id: number, dto: Partial<CreateCoachDto>) => api.patch<Coach>(`/coaches/${id}`, dto),
  updateStatus: (id: number, status: CoachStatus, shortlistSource?: ShortlistSource) =>
    api.patch<Coach>(`/coaches/${id}/status`, { status, ...(shortlistSource && { shortlistSource }) }),

  // Evaluation (generic — dto shape depends on role)
  upsertEvaluation: (coachId: string, dto: Record<string, unknown>) =>
    api.put<unknown>(`/coaches/${coachId}/evaluation`, dto),

  // TutorAssignment
  listTutors: (coachId: string) => api.get<TutorAssignment[]>(`/coaches/${coachId}/tutors`),
  createTutor: (coachId: string, dto: CreateTutorDto) =>
    api.post<TutorAssignment>(`/coaches/${coachId}/tutors`, dto),
  updateTutor: (coachId: string, tutorId: number, dto: Record<string, unknown>) =>
    api.patch<TutorAssignment>(`/coaches/${coachId}/tutors/${tutorId}`, dto),
}
