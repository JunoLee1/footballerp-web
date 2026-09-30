import { api } from './api'
import type { MedicalExpense, CreateExpenseDto, UpdateExpenseDto } from '@/types/medical-expense'

function buildExpenseForm(dto: CreateExpenseDto | UpdateExpenseDto): FormData {
  const form = new FormData()
  const { file, ...rest } = dto as any
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined && value !== null) form.append(key, String(value))
    else if (value === null) form.append(key, '')
  }
  if (file) form.append('file', file)
  return form
}

export const medicalExpenseApi = {
  list: () => api.get<MedicalExpense[]>('/medical-expenses'),

  get: (id: string) => api.get<MedicalExpense>(`/medical-expenses/${id}`),

  create: (dto: CreateExpenseDto) =>
    api.postForm<MedicalExpense>('/medical-expenses', buildExpenseForm(dto)),

  update: (id: string, dto: UpdateExpenseDto) =>
    api.patchForm<MedicalExpense>(`/medical-expenses/${id}`, buildExpenseForm(dto)),

  submit: (id: string) => api.post<MedicalExpense>(`/medical-expenses/${id}/submit`),

  leaderApprove: (id: string) => api.post<MedicalExpense>(`/medical-expenses/${id}/leader-approve`),

  leaderReject: (id: string, reason: string) =>
    api.post<MedicalExpense>(`/medical-expenses/${id}/leader-reject`, { reason }),

  approve: (id: string) => api.post<MedicalExpense>(`/medical-expenses/${id}/approve`),

  reject: (id: string, reason: string) =>
    api.post<MedicalExpense>(`/medical-expenses/${id}/reject`, { reason }),
}
