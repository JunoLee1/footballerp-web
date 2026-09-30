export type BadgeType =
  | 'PASSION_KING'
  | 'SPACE_WIZARD'
  | 'BEST_PASSER'
  | 'TEAM_PLAYER'
  | 'MOST_IMPROVED'
  | 'DEFENSIVE_WALL'
  | 'GOAL_MACHINE'

export const BADGE_LABEL: Record<BadgeType, string> = {
  PASSION_KING: 'Passion King',
  SPACE_WIZARD: 'Space Wizard',
  BEST_PASSER: 'Best Passer',
  TEAM_PLAYER: 'Team Player',
  MOST_IMPROVED: 'Most Improved',
  DEFENSIVE_WALL: 'Defensive Wall',
  GOAL_MACHINE: 'Goal Machine',
}

export interface GrowthEvaluation {
  id: number
  playerId: string
  player: { id: string; playerName: string; guardianId: string | null }
  coachId: string
  coach: { id: number; username: string; nickname: string }
  planId: number | null
  plan: { id: number; goals: string; seasonId: number } | null
  year: number
  month: number
  isPublished: boolean
  publishedAt: string | null
  attitudeScore: number
  attitudeComment: string
  fundamentalsScore: number
  fundamentalsComment: string
  spatialScore: number
  spatialComment: string
  physicalScore: number
  physicalComment: string
  createdAt: string
  updatedAt: string
}

export interface PlayerBadge {
  id: number
  playerId: string
  player: { id: string; playerName: string }
  coachId: string
  coach: { id: number; username: string; nickname: string }
  sessionId: number | null
  session: { id: number; date: string } | null
  badgeType: BadgeType
  awardedAt: string
  note: string | null
}

export interface CreateGrowthEvaluationPayload {
  playerId: string
  year: number
  month: number
  attitudeScore: number
  attitudeComment: string
  fundamentalsScore: number
  fundamentalsComment: string
  spatialScore: number
  spatialComment: string
  physicalScore: number
  physicalComment: string
}

export interface PositionAverage {
  position: string
  sampleCount: number
  avgAttitudeScore: number | null
  avgFundamentalsScore: number | null
  avgSpatialScore: number | null
  avgPhysicalScore: number | null
}

export interface AwardBadgePayload {
  playerId: string
  sessionId?: number
  badgeType: BadgeType
  note?: string
}
