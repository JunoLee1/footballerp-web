export type TacticalPhase = 'PRE_MATCH' | 'POST_MATCH'
export type TacticalStatus = 'DRAFT' | 'CONFIRMED'
export type TacticalMediaType = 'image' | 'video'

export interface TacticalMedia {
  id: number
  url: string
  type: TacticalMediaType
  tacticalAnalysisId: number
}

export interface TacticalAnalysis {
  id: number
  matchId: number
  phase: TacticalPhase
  status: TacticalStatus
  formation: string | null
  opponentAnalysis: string | null
  createdById: string
  createdAt: string
  // PRE_MATCH
  opponentFormation: string | null
  opponentKeyThreat: string | null
  opponentWeakness: string | null
  opponentKeyPlayer: string | null
  opponentPressureScore: number | null
  opponentSetPieceScore: number | null
  opponentCounterScore: number | null
  // POST_MATCH
  tacticalCompliance: string | null
  concededAnalysis: string | null
  momPlayerId: string | null
  momNote: string | null
  improvementPlayerId: string | null
  improvementNote: string | null
  match: {
    homeTeamName: string
    awayTeamName: string
    date: string
    homeScore: number | null
    awayScore: number | null
  }
  createdBy: { nickname: string }
  momPlayer: { playerName: string } | null
  improvementPlayer: { playerName: string } | null
  media?: TacticalMedia[]
}

export interface CreateTacticalDto {
  matchId: number
  phase: TacticalPhase
  formation?: string
  opponentAnalysis?: string
  opponentFormation?: string
  opponentKeyThreat?: string
  opponentWeakness?: string
  opponentKeyPlayer?: string
  opponentPressureScore?: number | null
  opponentSetPieceScore?: number | null
  opponentCounterScore?: number | null
  tacticalCompliance?: string
  concededAnalysis?: string
  momPlayerId?: string
  momNote?: string
  improvementPlayerId?: string
  improvementNote?: string
}

export interface UpdateTacticalDto {
  formation?: string
  opponentAnalysis?: string
  opponentFormation?: string
  opponentKeyThreat?: string
  opponentWeakness?: string
  opponentKeyPlayer?: string
  opponentPressureScore?: number | null
  opponentSetPieceScore?: number | null
  opponentCounterScore?: number | null
  tacticalCompliance?: string
  concededAnalysis?: string
  momPlayerId?: string
  momNote?: string
  improvementPlayerId?: string
  improvementNote?: string
}

export const FORMATION_OPTIONS = [
  '4-3-3',
  '4-4-2',
  '4-2-3-1',
  '4-1-4-1',
  '4-5-1',
  '3-5-2',
  '3-4-3',
  '3-4-2-1',
  '5-3-2',
  '5-4-1',
  '4-3-2-1',
] as const

export const PHASE_LABEL: Record<TacticalPhase, string> = {
  PRE_MATCH: 'Pre-Match',
  POST_MATCH: 'Post-Match',
}

export const PHASE_STYLE: Record<TacticalPhase, string> = {
  PRE_MATCH: 'bg-blue-100 text-blue-800 border-blue-200',
  POST_MATCH: 'bg-purple-100 text-purple-800 border-purple-200',
}

export const STATUS_LABEL: Record<TacticalStatus, string> = {
  DRAFT: 'Draft',
  CONFIRMED: 'Confirmed',
}

export const STATUS_STYLE: Record<TacticalStatus, string> = {
  DRAFT: 'bg-amber-100 text-amber-800 border-amber-200',
  CONFIRMED: 'bg-green-100 text-green-800 border-green-200',
}

export const MEDIA_TYPE_LABEL: Record<TacticalMediaType, string> = {
  image: 'Image',
  video: 'Video',
}
