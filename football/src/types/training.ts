export type SessionType =
  | 'INDIVIDUAL_SKILL'
  | 'TACTICAL_DEFENSIVE'
  | 'TACTICAL_ATTACKING'
  | 'TACTICAL_FULL_TEAM'
  | 'PHYSICAL'
  | 'PSYCHOLOGICAL_SOCIAL'
  | 'SET_PIECE'

export type ContentPhase = 'WARMUP' | 'DRILL' | 'TACTICAL' | 'GAME'
export type AttendanceStatus =
  | 'PRESENT'
  | 'ABSENT_UNAUTHORIZED'
  | 'LATE_UNAUTHORIZED'
  | 'ABSENT_AUTHORIZED'

export interface TrainingSession {
  id: number
  date: string
  goal: string
  sessionType: SessionType
  isApproved: boolean
  seasonId: number
  createdById: string
}

export interface TrainingContent {
  id: number
  phase: ContentPhase
  description: string
}

export interface TrainingParticipant {
  playerId: string
  player: { playerName: string; position: string }
}

export interface TrainingResult {
  id: number
  playerId: string
  attendance: AttendanceStatus
  feedback: string | null
  performanceScore: number | null
}

export interface TrainingSessionDetail extends TrainingSession {
  approvedById: string | null
  contents: TrainingContent[]
  participants: TrainingParticipant[]
  results: TrainingResult[]
}

export const SESSION_TYPE_LABEL: Record<SessionType, string> = {
  INDIVIDUAL_SKILL: '개인 기술',
  TACTICAL_DEFENSIVE: '수비 전술',
  TACTICAL_ATTACKING: '공격 전술',
  TACTICAL_FULL_TEAM: '전체 전술',
  PHYSICAL: '체력',
  PSYCHOLOGICAL_SOCIAL: '심리·사회',
  SET_PIECE: '세트피스',
}

export const SESSION_TYPE_STYLE: Record<SessionType, string> = {
  INDIVIDUAL_SKILL: 'bg-blue-100 text-blue-800 border-blue-200',
  TACTICAL_DEFENSIVE: 'bg-slate-100 text-slate-700 border-slate-200',
  TACTICAL_ATTACKING: 'bg-rose-100 text-rose-800 border-rose-200',
  TACTICAL_FULL_TEAM: 'bg-purple-100 text-purple-800 border-purple-200',
  PHYSICAL: 'bg-amber-100 text-amber-800 border-amber-200',
  PSYCHOLOGICAL_SOCIAL: 'bg-teal-100 text-teal-800 border-teal-200',
  SET_PIECE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
}

export const PHASE_LABEL: Record<ContentPhase, string> = {
  WARMUP: '워밍업',
  DRILL: '드릴',
  TACTICAL: '전술',
  GAME: '게임',
}

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: '출석',
  ABSENT_UNAUTHORIZED: '무단 결석',
  LATE_UNAUTHORIZED: '무단 지각',
  ABSENT_AUTHORIZED: '승인 결석',
}

export const ATTENDANCE_STYLE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-green-100 text-green-800 border-green-200',
  ABSENT_UNAUTHORIZED: 'bg-red-100 text-red-800 border-red-200',
  LATE_UNAUTHORIZED: 'bg-orange-100 text-orange-800 border-orange-200',
  ABSENT_AUTHORIZED: 'bg-gray-100 text-gray-600 border-gray-200',
}

export interface TrainingResultRow {
  id: number
  attendance: AttendanceStatus
  feedback: string | null
  performanceScore: number | null
  playerId: string
  sessionId: number
  hasCorrectionHistory: boolean
  session: {
    id: number
    date: string
    sessionType: SessionType
    goal: string
  }
  player: {
    id: string
    playerName: string
    position: string
  }
}

export interface TrainingResultFilters {
  from?: string
  to?: string
  sessionType?: SessionType | ''
  playerId?: string
  nullOnly?: boolean
}
