import { api } from './api'
import type {
  EquipmentItem,
  EquipmentUnit,
  EquipmentAssignment,
  CreateEquipmentItemDto,
  EquipmentUnitStatus,
  EquipmentLoan,
  EquipmentLoanStatus,
} from '@/types/equipment'

export const equipmentApi = {
  listItems: () => api.get<EquipmentItem[]>('/equipment'),

  getItem: (id: string) => api.get<EquipmentItem>(`/equipment/${id}`),

  createItem: (dto: CreateEquipmentItemDto) =>
    api.post<EquipmentItem>('/equipment', dto),

  updateUnitStatus: (unitId: number, status: EquipmentUnitStatus) =>
    api.patch<EquipmentUnit>(`/equipment/units/${unitId}/status`, { status }),

  listAssignments: (playerId?: string) =>
    api.get<EquipmentAssignment[]>(
      `/equipment/assignments${playerId ? `?playerId=${playerId}` : ''}`,
    ),

  assign: (playerId: string, equipmentItemId: string, equipmentUnitId?: number) =>
    api.post<EquipmentAssignment>('/equipment/assignments', {
      playerId,
      equipmentItemId,
      ...(equipmentUnitId != null && { equipmentUnitId }),
    }),

  returnAssignment: (assignmentId: number) =>
    api.patch<EquipmentAssignment>(`/equipment/assignments/${assignmentId}/return`, {}),
}

export const loanApi = {
  list: (status?: EquipmentLoanStatus) =>
    api.get<EquipmentLoan[]>(`/equipment/loans${status ? `?status=${status}` : ''}`),

  my: () => api.get<EquipmentLoan[]>('/equipment/loans/my'),

  request: (dto: { equipmentItemId: string; dueDate: string; notes?: string }) =>
    api.post<EquipmentLoan>('/equipment/loans', dto),

  approve: (loanId: number) =>
    api.post<EquipmentLoan>(`/equipment/loans/${loanId}/approve`, {}),

  reject: (loanId: number) =>
    api.post<EquipmentLoan>(`/equipment/loans/${loanId}/reject`, {}),

  issue: (loanId: number, equipmentUnitId?: number) =>
    api.post<EquipmentLoan>(`/equipment/loans/${loanId}/issue`, { equipmentUnitId }),

  return: (loanId: number) =>
    api.post<EquipmentLoan>(`/equipment/loans/${loanId}/return`, {}),
}
