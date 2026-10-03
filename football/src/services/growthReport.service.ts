import { api } from './api'
import type {
  GrowthEvaluation,
  PlayerBadge,
  CreateGrowthEvaluationPayload,
  AwardBadgePayload,
  PositionAverage,
} from '@/types/growth-report'

export const growthReportApi = {
  getEvaluationsByPlayer: (playerId: string) =>
    api.get<GrowthEvaluation[]>(`/growth-reports/player/${playerId}`),

  getEvaluationById: (id: number) =>
    api.get<GrowthEvaluation>(`/growth-reports/${id}`),

  createEvaluation: (payload: CreateGrowthEvaluationPayload) =>
    api.post<GrowthEvaluation>('/growth-reports', payload),

  updateEvaluation: (id: number, payload: Partial<CreateGrowthEvaluationPayload>) =>
    api.patch<GrowthEvaluation>(`/growth-reports/${id}`, payload),

  publishEvaluation: (id: number) =>
    api.patch<GrowthEvaluation>(`/growth-reports/${id}/publish`, {}),

  getBadgesByPlayer: (playerId: string) =>
    api.get<PlayerBadge[]>(`/growth-reports/badges/player/${playerId}`),

  awardBadge: (payload: AwardBadgePayload) =>
    api.post<PlayerBadge>('/growth-reports/badges', payload),

  getPositionAverage: (playerId: string): Promise<PositionAverage> =>
    api.get<PositionAverage>(`/growth-reports/position-average?playerId=${encodeURIComponent(playerId)}`),
}
