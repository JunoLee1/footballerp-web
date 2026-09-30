import { api } from './api'
import type { SafeguardReport, CreateSafeguardReportPayload } from '@/types/safeguard'

export const safeguardApi = {
  submit: (payload: CreateSafeguardReportPayload) =>
    api.post<SafeguardReport>('/safeguard-reports', payload),

  getAll: () =>
    api.get<SafeguardReport[]>('/safeguard-reports'),

  updateStatus: (id: string, status: string, resolvedNote?: string) =>
    api.patch<SafeguardReport>(`/safeguard-reports/${id}/status`, { status, resolvedNote }),
}
