import { api } from './api'
import type { Injury, InjuryDetail, InjuryStatus, InjuryCause, HospitalType, InjuryReport, RehabStage, RiskLevel, SecurityLevel, InjuryAssessment, ExternalReport, ExternalReportStatus, BodyPart } from '@/types/injury'

export const injuryApi = {
  active: () =>
    api.get<{ playerId: string; status: InjuryStatus }[]>('/injuries/active'),

  byPlayer: (playerId: string) =>
    api.get<Injury[]>(`/injuries/player/${playerId}`),

  get: (id: string) =>
    api.get<InjuryDetail>(`/injuries/${id}`),

  create: (payload: {
    playerId: string
    bodyPart: BodyPart
    cause: InjuryCause
    expectedReturnDate?: string
    hospitalType?: HospitalType
    partnerId?: number
    customHospitalName?: string
  }) => api.post<Injury>('/injuries', payload),

  updateStatus: (id: string, status: InjuryStatus, expectedReturnDate?: string) =>
    api.patch<Injury>(`/injuries/${id}/status`, {
      status,
      ...(expectedReturnDate && { expectedReturnDate }),
    }),

  stats: () =>
    api.get<{
      activeCount: number
      byBodyPart: Record<string, number>
      byCause: Record<string, number>
      avgRecoveryDays: number | null
    }>('/injuries/stats'),

  getReport: (injuryId: string) =>
    api.get<InjuryReport | null>(`/injuries/${injuryId}/report`),

  saveReport: (injuryId: string, payload: {
    diagnosisName?: string
    treatmentContent?: string
    rehabStage?: RehabStage
    trainingReturnDate?: string
    matchAvailable?: boolean
    reinjuryRisk?: RiskLevel
    medicalOpinion?: string
    rehabLoadPercentage?: number
    allowedActivities?: string
    securityLevel?: SecurityLevel
  }) => api.put<InjuryReport>(`/injuries/${injuryId}/report`, payload),

  signReport: (injuryId: string) =>
    api.post<InjuryReport>(`/injuries/${injuryId}/report/sign`, {}),

  unsignReport: (injuryId: string) =>
    api.delete<InjuryReport>(`/injuries/${injuryId}/report/sign`),

  getAssessment: (injuryId: string) =>
    api.get<InjuryAssessment | null>(`/injuries/${injuryId}/assessment`),

  saveAssessment: (injuryId: string, dto: {
    painLevel: number
    hasSwelling: boolean
    romScore: number
    strengthScore: number
    sprintScore: number
    jumpScore: number
    psychScore: number
    positionRiskScore: number
  }) => api.put<{ assessment: InjuryAssessment; triggeredReports: boolean }>(`/injuries/${injuryId}/assessment`, dto),

  getExternalReports: (injuryId: string) =>
    api.get<ExternalReport[]>(`/injuries/${injuryId}/external-reports`),

  updateExternalReportStatus: (injuryId: string, reportId: number, status: ExternalReportStatus, note?: string) =>
    api.patch<ExternalReport>(`/injuries/${injuryId}/external-reports/${reportId}/status`, {
      status,
      ...(note !== undefined && { note }),
    }),
}
