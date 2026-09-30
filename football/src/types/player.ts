import type { WorkPermitStatus } from './prospect'

export type PlayerStatus = 'ACTIVE' | 'ON_LOAN' | 'RELEASED' | 'RETIRED'

export type PlayStyle =
  | 'SWEEPER_KEEPER' | 'TRADITIONAL_GK'
  | 'BALL_PLAYING_CB' | 'STOPPER' | 'LIBERO'
  | 'INVERTED_FULLBACK' | 'OVERLAPPING_WINGBACK' | 'DEFENSIVE_WINGBACK'
  | 'REGISTA' | 'HALF_BACK' | 'DEFENSIVE_MIDFIELDER'
  | 'BOX_TO_BOX' | 'MEZZALA' | 'CARRILERO' | 'DEEP_LYING_PLAYMAKER'
  | 'TREQUARTISTA' | 'ADVANCED_PLAYMAKER'
  | 'INVERTED_WINGER' | 'INSIDE_FORWARD' | 'WIDE_MIDFIELDER'
  | 'FALSE_9' | 'TARGET_MAN' | 'POACHER' | 'COMPLETE_FORWARD' | 'PRESSING_FORWARD'

export const PLAY_STYLE_LABEL: Record<PlayStyle, string> = {
  SWEEPER_KEEPER: '스위퍼 키퍼',
  TRADITIONAL_GK: '전통 골키퍼',
  BALL_PLAYING_CB: '빌드업 센터백',
  STOPPER: '스토퍼',
  LIBERO: '리베로',
  INVERTED_FULLBACK: '인버티드 풀백',
  OVERLAPPING_WINGBACK: '오버래핑 윙백',
  DEFENSIVE_WINGBACK: '수비형 윙백',
  REGISTA: '레지스타',
  HALF_BACK: '하프백',
  DEFENSIVE_MIDFIELDER: '수비형 미드필더',
  BOX_TO_BOX: '박스 투 박스',
  MEZZALA: '메짤라',
  CARRILERO: '카리예로',
  DEEP_LYING_PLAYMAKER: '딥 라잉 플레이메이커',
  TREQUARTISTA: '트레콰르티스타',
  ADVANCED_PLAYMAKER: '어드밴스드 플레이메이커',
  INVERTED_WINGER: '인버티드 윙어',
  INSIDE_FORWARD: '인사이드 포워드',
  WIDE_MIDFIELDER: '와이드 미드필더',
  FALSE_9: '폴스 나인',
  TARGET_MAN: '타깃맨',
  POACHER: '포처',
  COMPLETE_FORWARD: '완전형 공격수',
  PRESSING_FORWARD: '프레싱 포워드',
}

export const POSITION_PLAY_STYLES: Record<Position, PlayStyle[]> = {
  GOALKEEPER:                   ['SWEEPER_KEEPER', 'TRADITIONAL_GK'],
  CENTER_BACK:                  ['BALL_PLAYING_CB', 'STOPPER', 'LIBERO'],
  LEFT_FULL_BACK:               ['INVERTED_FULLBACK', 'OVERLAPPING_WINGBACK', 'DEFENSIVE_WINGBACK'],
  RIGHT_FULL_BACK:              ['INVERTED_FULLBACK', 'OVERLAPPING_WINGBACK', 'DEFENSIVE_WINGBACK'],
  LEFT_WING_BACK:               ['OVERLAPPING_WINGBACK', 'DEFENSIVE_WINGBACK', 'INVERTED_FULLBACK'],
  RIGHT_WING_BACK:              ['OVERLAPPING_WINGBACK', 'DEFENSIVE_WINGBACK', 'INVERTED_FULLBACK'],
  CENTRAL_DEFENSIVE_MIDFIELDER: ['REGISTA', 'HALF_BACK', 'DEFENSIVE_MIDFIELDER', 'BOX_TO_BOX'],
  LEFT_DEFENSIVE_MIDFIELDER:    ['DEFENSIVE_MIDFIELDER', 'CARRILERO', 'BOX_TO_BOX'],
  RIGHT_DEFENSIVE_MIDFIELDER:   ['DEFENSIVE_MIDFIELDER', 'CARRILERO', 'BOX_TO_BOX'],
  CENTRAL_ATTACK_MIDFIELDER:    ['TREQUARTISTA', 'ADVANCED_PLAYMAKER', 'MEZZALA', 'BOX_TO_BOX'],
  LEFT_ATTACK_MIDFIELDER:       ['ADVANCED_PLAYMAKER', 'MEZZALA', 'CARRILERO'],
  RIGHT_ATTACK_MIDFIELDER:      ['ADVANCED_PLAYMAKER', 'MEZZALA', 'CARRILERO'],
  WINGER:                       ['INVERTED_WINGER', 'INSIDE_FORWARD', 'WIDE_MIDFIELDER'],
  SHADOW_STRIKER:               ['INSIDE_FORWARD', 'TREQUARTISTA', 'ADVANCED_PLAYMAKER'],
  STRIKER:                      ['FALSE_9', 'TARGET_MAN', 'POACHER', 'COMPLETE_FORWARD', 'PRESSING_FORWARD'],
}
export type PlayerLevel = 'YOUTH' | 'ROOKIE' | 'SENIOR' | 'VETERAN'
export type Foot = 'LEFT' | 'RIGHT'

export type Position =
  | 'GOALKEEPER'
  | 'STRIKER'
  | 'SHADOW_STRIKER'
  | 'WINGER'
  | 'CENTRAL_ATTACK_MIDFIELDER'
  | 'RIGHT_ATTACK_MIDFIELDER'
  | 'LEFT_ATTACK_MIDFIELDER'
  | 'CENTRAL_DEFENSIVE_MIDFIELDER'
  | 'LEFT_DEFENSIVE_MIDFIELDER'
  | 'RIGHT_DEFENSIVE_MIDFIELDER'
  | 'CENTER_BACK'
  | 'LEFT_WING_BACK'
  | 'LEFT_FULL_BACK'
  | 'RIGHT_WING_BACK'
  | 'RIGHT_FULL_BACK'

export interface PlayerNationality {
  id: number
  name: string
  code: string
}

export interface PlayerContract {
  id: string
  startDate: string
  endDate: string
  salary: number
  status: string
}

export interface Player {
  id: string
  playerName: string
  dateOfBirth: string
  preferredFoot: Foot
  height: number
  weight: number
  position: Position
  level: PlayerLevel
  status: PlayerStatus
  externalId: string | null
  currentMarketValue: number | null
  nationality: PlayerNationality
}

export type TransferType = 'PERMANENT_IN' | 'PERMANENT_OUT' | 'LOAN_OUT' | 'LOAN_IN' | 'FREE' | 'RELEASE'

export interface PlayerTransfer {
  id: number
  type: TransferType
  date: string
  fee: number | null
  fromClub: string | null
  toClub: string | null
}


export interface PlayerDetail extends Player {
  userId: string | null
  agentId: string | null
  teamId: number | null
  playStyle: string | null
  allergies: string[]
  foodPreferences: string | null
  team: { id: number; type: 'FIRST_TEAM' | 'YOUTH' } | null
  contracts: PlayerContract[]
  transfers: PlayerTransfer[]
  promotedFromYouthAt?: string | null
  youthOriginTeamId?: number | null
  workPermitStatus: WorkPermitStatus
  workPermitExpiry: string | null
}

export interface PlayerListQuery {
  status?: PlayerStatus
  position?: Position
  level?: PlayerLevel
  excludeYouth?: boolean
}

export interface CreatePlayerPayload {
  playerName: string
  dateOfBirth: string
  preferredFoot: Foot
  height: number
  weight: number
  position: Position
  level: PlayerLevel
  nationalityId: number
  externalId?: string
}

export interface UpdatePlayerPayload {
  playerName?: string
  dateOfBirth?: string
  preferredFoot?: Foot
  height?: number
  weight?: number
  position?: Position
  level?: PlayerLevel
  nationalityId?: number
  externalId?: string
  allergies?: string[]
}

export const POSITION_ABBR: Record<Position, string> = {
  GOALKEEPER: 'GK',
  STRIKER: 'ST',
  SHADOW_STRIKER: 'SS',
  WINGER: 'WG',
  CENTRAL_ATTACK_MIDFIELDER: 'CAM',
  RIGHT_ATTACK_MIDFIELDER: 'RAM',
  LEFT_ATTACK_MIDFIELDER: 'LAM',
  CENTRAL_DEFENSIVE_MIDFIELDER: 'CDM',
  LEFT_DEFENSIVE_MIDFIELDER: 'LDM',
  RIGHT_DEFENSIVE_MIDFIELDER: 'RDM',
  CENTER_BACK: 'CB',
  LEFT_WING_BACK: 'LWB',
  LEFT_FULL_BACK: 'LB',
  RIGHT_WING_BACK: 'RWB',
  RIGHT_FULL_BACK: 'RB',
}

export const POSITION_LABEL: Record<Position, string> = {
  GOALKEEPER: '골키퍼',
  STRIKER: '공격수',
  SHADOW_STRIKER: '섀도 스트라이커',
  WINGER: '윙어',
  CENTRAL_ATTACK_MIDFIELDER: '중앙 공격형 미드필더',
  RIGHT_ATTACK_MIDFIELDER: '우측 공격형 미드필더',
  LEFT_ATTACK_MIDFIELDER: '좌측 공격형 미드필더',
  CENTRAL_DEFENSIVE_MIDFIELDER: '중앙 수비형 미드필더',
  LEFT_DEFENSIVE_MIDFIELDER: '좌측 수비형 미드필더',
  RIGHT_DEFENSIVE_MIDFIELDER: '우측 수비형 미드필더',
  CENTER_BACK: '센터백',
  LEFT_WING_BACK: '좌측 윙백',
  LEFT_FULL_BACK: '좌측 풀백',
  RIGHT_WING_BACK: '우측 윙백',
  RIGHT_FULL_BACK: '우측 풀백',
}

export type PositionZone = 'GK' | 'DEF' | 'MID' | 'FWD'

export const POSITION_ZONE: Record<Position, PositionZone> = {
  GOALKEEPER: 'GK',
  CENTER_BACK: 'DEF',
  LEFT_WING_BACK: 'DEF',
  LEFT_FULL_BACK: 'DEF',
  RIGHT_WING_BACK: 'DEF',
  RIGHT_FULL_BACK: 'DEF',
  CENTRAL_DEFENSIVE_MIDFIELDER: 'MID',
  LEFT_DEFENSIVE_MIDFIELDER: 'MID',
  RIGHT_DEFENSIVE_MIDFIELDER: 'MID',
  CENTRAL_ATTACK_MIDFIELDER: 'MID',
  RIGHT_ATTACK_MIDFIELDER: 'MID',
  LEFT_ATTACK_MIDFIELDER: 'MID',
  STRIKER: 'FWD',
  SHADOW_STRIKER: 'FWD',
  WINGER: 'FWD',
}

export const LEVEL_LABEL: Record<PlayerLevel, string> = {
  YOUTH: 'Youth',
  ROOKIE: 'Rookie',
  SENIOR: 'Senior',
  VETERAN: 'Veteran',
}

export const STATUS_LABEL: Record<PlayerStatus, string> = {
  ACTIVE: 'Active',
  ON_LOAN: 'On Loan',
  RELEASED: 'Released',
  RETIRED: 'Retired',
}

export const WORK_PERMIT_LABEL: Record<WorkPermitStatus, string> = {
  NOT_REQUIRED: '해당없음',
  PENDING: '진행중',
  APPROVED: '취득완료',
  REJECTED: '거절',
}

export const WORK_PERMIT_STYLE: Record<WorkPermitStatus, string> = {
  NOT_REQUIRED: 'text-muted-foreground',
  PENDING: 'text-yellow-600',
  APPROVED: 'text-green-600',
  REJECTED: 'text-red-600',
}

export interface JerseyNumber {
  id: number
  number: number
  status: 'AVAILABLE' | 'OCCUPIED' | 'RETIRED' | 'RESERVED'
  teamId: number
}

export interface TeamJerseyEntry {
  id: number
  number: number
  status: 'AVAILABLE' | 'OCCUPIED' | 'RETIRED' | 'RESERVED'
  teamId: number
  player?: { id: string; playerName: string; position: string } | null
}

export interface MarketValueEntry {
  id: number
  value: number
  source: 'MANUAL' | 'EXTERNAL_API'
  recordedAt: string
}

export interface MatchStat {
  id: number
  goals: number | null
  assists: number | null
  shots: number | null
  keyPasses: number | null
  xG: number | null
  xA: number | null
  passesAttempted: number | null
  passesCompleted: number | null
  tackles: number | null
  tacklesAttempted: number | null
  tackleSuccessRate: number | null
  clearances: number | null
  interceptions: number | null
  saves: number | null
  cleanSheet: boolean | null
  aerialDuelSuccessRate: number | null
  groundDuels: number | null
  groundDuelsAttempted: number | null
  groundDuelSuccessRate: number | null
  aerialDuels: number | null
  aerialDuelsAttempted: number | null
  ballRecoveries: number | null
  turnovers: number | null
  distanceCovered: number | null
  sprint: number | null
  clearCutChanceRate: number | null
  penaltyConversionRate: number | null
  freeKickConversionRate: number | null
  crossesCompleted: number | null
  shotsOnTarget: number | null
  shotsAllowed: number | null
  shotBlocked: number | null
  foulsCommitted: number | null
  dribblesAttempted: number | null
  dribblesCompleted: number | null
  dribblesFailed: number | null
  longPassesAttempted: number | null
  longPassesCompleted: number | null
  minutesPlayed: number | null
  match: {
    id: number
    date: string
    seasonId: number
  }
}

export interface TrainingResultEntry {
  id: number
  attendance: string
  feedback: string | null
  performanceScore: number | null
  session: {
    id: number
    date: string
    sessionType: string
    goal: string
  }
}

export interface RadarData {
  scores: Record<string, number>
  strengths: string[]
  weaknesses: string[]
  message?: string
}
