export type ContractStatus = 'ACTIVE' | 'EXPIRED' | 'TERMINATED'
export type BonusMetric =
  | 'GOALS' | 'ASSISTS' | 'APPEARANCES' | 'CLEAN_SHEETS' | 'SAVES'
  | 'PASS_ACCURACY' | 'TACKLE_SUCCESS_RATE' | 'CLEARANCES' | 'INTERCEPTIONS'
  | 'XG' | 'TEAM_RANK' | 'TEAM_WINS'
export type BonusPeriod = 'SEASON' | 'MONTH' | 'MATCH'
export type CompetitionType = 'LEAGUE' | 'CUP' | 'FRIENDLY' | 'CHAMPIONS_LEAGUE'
export type BonusTeamScope = 'ALL' | 'FIRST_TEAM_ONLY'

export interface BonusTrigger {
  id: number
  metric: BonusMetric
  threshold: number
  period: BonusPeriod
  competitionType: CompetitionType | null
}

export interface PerformanceBonus {
  id: number
  amount: number
  description: string
  triggers: BonusTrigger[]
}

export interface ContractSummary {
  id: string
  startDate: string
  endDate: string
  salary: number
  status: ContractStatus
  managedById: string | null
}

export interface ContractSummaryWithPlayer extends ContractSummary {
  player: { id: string; playerName: string }
}

export interface ContractDetail extends ContractSummary {
  playerId: string
  signingBonus: number
  signingBonusScheduledAt: string | null
  signingBonusPaidAt: string | null
  buyoutClause: { id: number; amount: number } | null
  extensionOptions: Array<{ id: number; condition: string; durationMonths: number }>
  performanceBonuses: PerformanceBonus[]
}

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  TERMINATED: 'Terminated',
}

export const CONTRACT_STATUS_STYLE: Record<ContractStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800 border-green-200',
  EXPIRED: 'bg-gray-100 text-gray-500 border-gray-200',
  TERMINATED: 'bg-red-100 text-red-700 border-red-200',
}

export const BONUS_METRIC_LABEL: Record<BonusMetric, string> = {
  GOALS: 'Goals',
  ASSISTS: 'Assists',
  APPEARANCES: 'Appearances',
  CLEAN_SHEETS: 'Clean Sheets',
  SAVES: 'Saves',
  PASS_ACCURACY: 'Pass Accuracy (%)',
  TACKLE_SUCCESS_RATE: 'Tackle Success (%)',
  CLEARANCES: 'Clearances',
  INTERCEPTIONS: 'Interceptions',
  XG: 'xG',
  TEAM_RANK: 'Team Rank',
  TEAM_WINS: 'Team Wins',
}

export const BONUS_PERIOD_LABEL: Record<BonusPeriod, string> = {
  SEASON: 'Season',
  MONTH: 'Monthly',
  MATCH: 'Per Match',
}

export interface CreateExtensionDto {
  condition: string
  durationMonths: number
}

export interface CreateBonusTriggerDto {
  metric: BonusMetric
  threshold: number
  period: BonusPeriod
  competitionType?: CompetitionType | null
  teamScope?: BonusTeamScope
}

export interface CreateBonusDto {
  amount: number
  description: string
  triggers: CreateBonusTriggerDto[]
}

export function formatSalary(salary: number): string {
  if (salary >= 100_000_000) return `${(salary / 100_000_000).toFixed(1)}억원`
  if (salary >= 10_000) return `${Math.round(salary / 10_000).toLocaleString()}만원`
  return `${salary.toLocaleString()}원`
}
