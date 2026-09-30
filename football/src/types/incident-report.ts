export type IncidentReportStatus = 'DRAFT' | 'SUBMITTED' | 'SIGNED'
export type IncidentType = 'MATCH' | 'TRAINING'

export interface IncidentReport {
  id: string
  playerId: string
  player: { id: string; playerName: string; guardianId: string | null }
  teamId: number
  team: { id: number; name: string }
  type: IncidentType
  matchId: number | null
  sessionId: number | null
  description: string
  reportedById: string
  reportedBy: { id: string; username: string }
  supervisorSigned: boolean
  medicalSigned: boolean
  injuryId: string | null
  status: IncidentReportStatus
  createdAt: string
}

export interface CreateIncidentReportPayload {
  playerId: string
  teamId: number
  type: IncidentType
  matchId?: number
  sessionId?: number
  description: string
}
