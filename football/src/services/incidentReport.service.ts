import { api } from './api'
import type { IncidentReport, CreateIncidentReportPayload } from '@/types/incident-report'

export const incidentReportApi = {
  getAll: (params?: { teamId?: number; status?: string }) => {
    const qs = new URLSearchParams()
    if (params?.teamId) qs.set('teamId', String(params.teamId))
    if (params?.status) qs.set('status', params.status)
    const q = qs.toString()
    return api.get<IncidentReport[]>(`/incident-reports${q ? `?${q}` : ''}`)
  },

  getById: (id: string) =>
    api.get<IncidentReport>(`/incident-reports/${id}`),

  create: (payload: CreateIncidentReportPayload) =>
    api.post<IncidentReport>('/incident-reports', payload),

  submit: (id: string) =>
    api.patch<IncidentReport>(`/incident-reports/${id}/submit`, {}),

  sign: (id: number, role: 'SUPERVISOR' | 'MEDICAL') =>
    api.patch<IncidentReport>(`/incident-reports/${id}/sign`, { role }),
}
