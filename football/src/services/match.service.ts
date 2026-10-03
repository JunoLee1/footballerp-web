import { api } from './api'
import type { Match, MatchDetail, CompetitionType, ShotEvent, ShotResult, StatSheetData } from '@/types/match'

export const matchApi = {
  list: (params?: { seasonId?: number; competitionType?: CompetitionType }) => {
    const qs = new URLSearchParams()
    if (params?.seasonId) qs.set('seasonId', String(params.seasonId))
    if (params?.competitionType) qs.set('competitionType', params.competitionType)
    const q = qs.toString()
    return api.get<Match[]>(`/matches${q ? `?${q}` : ''}`)
  },

  get: (id: number) =>
    api.get<MatchDetail>(`/matches/${id}`),

  create: (payload: {
    date: string
    homeTeamName: string
    awayTeamName: string
    competitionType: CompetitionType
    seasonId: number
    externalId?: string
  }) => api.post<Match>('/matches', payload),

  update: (
    id: number,
    payload: {
      date?: string
      homeTeamName?: string
      awayTeamName?: string
      homeScore?: number
      awayScore?: number
      competitionType?: CompetitionType
    },
  ) => api.patch<Match>(`/matches/${id}`, payload),

  upsertPlayerStats: (
    id: number,
    payload: {
      playerId: string
      goals?: number
      assists?: number
      xG?: number
      xA?: number
      shots?: number
      shotsOnTarget?: number
      passesAttempted?: number
      passesCompleted?: number
      keyPasses?: number
      tackles?: number
      tacklesAttempted?: number
      interceptions?: number
      clearances?: number
      saves?: number
      shotsAllowed?: number
      shotBlocked?: number
      cleanSheet?: boolean
      minutesPlayed?: number
      ballRecoveries?: number
      turnovers?: number
      groundDuels?: number
      groundDuelsAttempted?: number
      aerialDuels?: number
      aerialDuelsAttempted?: number
      distanceCovered?: number
      sprint?: number
      foulsCommitted?: number
      dribblesAttempted?: number
      dribblesCompleted?: number
      dribblesFailed?: number
      longPassesAttempted?: number
      longPassesCompleted?: number
    },
  ) => api.put(`/matches/${id}/player-stats`, payload),

  upsertTeamStats: (
    id: number,
    payload: {
      possession: number
      yellowCards: number
      redCards: number
      corners: number
      offsides: number
      oppShots?: number
      oppShotsOnTarget?: number
      oppCorners?: number
      oppFouls?: number
      oppYellowCards?: number
      oppRedCards?: number
      oppXG?: number
      oppOffsides?: number
    },
  ) => api.put(`/matches/${id}/team-stats`, payload),

  getShots: (matchId: number) =>
    api.get<ShotEvent[]>(`/matches/${matchId}/shots`),

  createShot: (
    matchId: number,
    payload: {
      shooterId: string
      assisterId?: string
      assisterPositionOverride?: string
      xG: number
      result: ShotResult
      minute?: number
    },
  ) => api.post<ShotEvent>(`/matches/${matchId}/shots`, payload),

  deleteShot: (matchId: number, eventId: number) =>
    api.delete<void>(`/matches/${matchId}/shots/${eventId}`),

  getSquad: (matchId: number) =>
    api.get<{ playerId: string; player: { id: string; playerName: string; position: string } }[]>(`/matches/${matchId}/squad`),

  uploadStatSheet: (matchId: number, file: File) => {
    const form = new FormData()
    form.append('image', file)
    return api.postForm<{ id: number; statSheetRaw: StatSheetData; statSheetImagePath: string }>(
      `/matches/${matchId}/stat-sheet`,
      form,
    )
  },
}
