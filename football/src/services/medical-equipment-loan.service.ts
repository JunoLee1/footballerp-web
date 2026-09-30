import { api } from './api';
import type {
  MedicalEquipmentLoanLedger,
  RequestNormalMedicalLoanDto,
  RequestEmergencyMedicalLoanDto,
} from '@/types/medical-equipment-loan';

export const medicalEquipmentLoanApi = {
  list(params?: { status?: string; requestedById?: string }) {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.requestedById) qs.set('requestedById', String(params.requestedById));
    const query = qs.toString();
    return api.get<MedicalEquipmentLoanLedger[]>(
      `/medical-equipment-loan${query ? `?${query}` : ''}`
    );
  },

  get(id: number) {
    return api.get<MedicalEquipmentLoanLedger>(`/medical-equipment-loan/${id}`);
  },

  requestNormal(dto: RequestNormalMedicalLoanDto) {
    return api.post<{ loan: unknown; ledger: MedicalEquipmentLoanLedger }>(
      '/medical-equipment-loan/request',
      dto
    );
  },

  requestEmergency(dto: RequestEmergencyMedicalLoanDto) {
    return api.post<{ loan: unknown; ledger: MedicalEquipmentLoanLedger }>(
      '/medical-equipment-loan/emergency',
      dto
    );
  },

  approve(id: number, body?: { budgetLineId?: number; seasonId?: number; categoryId?: number }) {
    return api.post<MedicalEquipmentLoanLedger>(
      `/medical-equipment-loan/${id}/approve`,
      body ?? {}
    );
  },

  reject(id: number, rejectionReason: string) {
    return api.post<MedicalEquipmentLoanLedger>(
      `/medical-equipment-loan/${id}/reject`,
      { rejectionReason }
    );
  },
};
