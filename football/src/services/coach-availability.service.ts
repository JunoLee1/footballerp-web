import { api } from './api'
import type { CoachAvailability, CreateCoachAvailabilityPayload } from '@/types/coach-availability'

export const coachAvailabilityApi = {
  list: (params?: { userId?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams()
    if (params?.userId) q.set('userId', String(params.userId))
    if (params?.from) q.set('from', params.from)
    if (params?.to) q.set('to', params.to)
    const qs = q.toString()
    return api.get<CoachAvailability[]>(`/coach-availabilities${qs ? `?${qs}` : ''}`)
  },
  conflicts: (date: string) =>
    api.get<CoachAvailability[]>(`/coach-availabilities/conflicts?date=${date}`),
  create: (payload: CreateCoachAvailabilityPayload) =>
    api.post<CoachAvailability>('/coach-availabilities', payload),
  delete: (id: number) => api.delete<void>(`/coach-availabilities/${id}`),
}
