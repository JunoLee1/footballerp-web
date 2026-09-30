import type { Position, PlayStyle } from './player'

export type ProspectStatus = 'LONGLIST' | 'PRE_SHORTLIST' | 'SHORTLIST' | 'ACTIVE' | 'MEDICAL_TEST' | 'CONTRACT_PENDING' | 'SIGNED' | 'ARCHIVED'
export type VisaEligibility = 'NOT_REQUIRED' | 'CONFIRMED' | 'UNCERTAIN'
export type WorkPermitStatus = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED'

export interface Prospect {
  id: number
  name: string
  nationalityId: number | null
  nationality: { id: number; name: string; code: string } | null
  position: Position | null
  currentTeam: string | null
  notes: string | null
  status: ProspectStatus
  playStyle: PlayStyle | null
  convertedPlayerId: string | null
  createdAt: string
  createdBy: { nickname: string } | null
  visaRequired: boolean
  visaEligibility: VisaEligibility | null
  currentMarketValue: number | null
}

export interface CreateProspectDto {
  name: string
  nationalityId: number
  position?: Position
  currentTeam?: string
  notes?: string
  status?: 'LONGLIST' | 'PRE_SHORTLIST'
  playStyle?: PlayStyle
}

export interface UpdateProspectDto extends Partial<CreateProspectDto> {
  visaRequired?: boolean
  visaEligibility?: VisaEligibility
  currentMarketValue?: number | null
}

export interface SignProspectDto {
  dateOfBirth: string
  height: number
  weight: number
  preferredFoot?: 'LEFT' | 'RIGHT' | 'BOTH'
  position?: Position
  contractStartDate: string
  contractEndDate: string
  salary: number
  managedById?: string
  workPermitStatus?: WorkPermitStatus
  workPermitExpiry?: string
}

export const STATUS_LABEL: Record<ProspectStatus, string> = {
  LONGLIST: '롱리스트',
  PRE_SHORTLIST: '적극 검토 중',
  SHORTLIST: '쇼트리스트',
  ACTIVE: '협상 중',
  MEDICAL_TEST: '메디컬 테스트',
  CONTRACT_PENDING: '계약 검토',
  SIGNED: '계약 완료',
  ARCHIVED: '보류',
}

export const STATUS_STYLE: Record<ProspectStatus, string> = {
  LONGLIST: 'bg-slate-100 text-slate-700 border-slate-200',
  PRE_SHORTLIST: 'bg-sky-100 text-sky-700 border-sky-200',
  SHORTLIST: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  ACTIVE: 'bg-blue-100 text-blue-800 border-blue-200',
  MEDICAL_TEST: 'bg-purple-100 text-purple-800 border-purple-200',
  CONTRACT_PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
  SIGNED: 'bg-green-100 text-green-800 border-green-200',
  ARCHIVED: 'bg-gray-100 text-gray-500 border-gray-200',
}

export const VISA_ELIGIBILITY_LABEL: Record<VisaEligibility, string> = {
  NOT_REQUIRED: 'N/A',
  CONFIRMED: 'Confirmed',
  UNCERTAIN: 'Uncertain',
}

export const WORK_PERMIT_LABEL: Record<WorkPermitStatus, string> = {
  NOT_REQUIRED: 'N/A',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
}

export type VideoEvalResult = 'PASS' | 'FAIL' | 'PENDING'
export type EvaluationLogType = 'VIDEO_ANALYSIS' | 'CONSISTENCY' | 'FIELD_VISIT' | 'LEAGUE_LEVEL'

export type VideoAnalysisStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'

export interface VideoAnalysisJob {
  id: number
  prospectId: number
  videoUrl: string
  status: VideoAnalysisStatus
  pipelineData: PipelineData | null
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
}

export interface PipelineData {
  detectionConfidence: number
  trackingScore: number
  detectedJerseyNumbers: { number: number; confidence: number }[]
  playerCount?: number
}

export interface ProspectVideoEvaluation {
  id: number
  prospectId: number
  qualityPassed: boolean
  identifiable: boolean
  continuity: boolean
  jerseyNumber: number | null
  totalScore: number | null
  scoreData: Record<string, number> | null
  pipelineData: PipelineData | null
  result: VideoEvalResult
  notes: string | null
  evaluatedBy: { nickname: string }
  evaluatedAt: string
}

export interface ProspectEvaluationLog {
  id: number
  prospectId: number
  type: EvaluationLogType
  note: string
  evaluatedBy: { nickname: string }
  evaluatedAt: string
}

export interface CreateVideoEvaluationDto {
  qualityPassed: boolean
  identifiable: boolean
  continuity: boolean
  jerseyNumber?: number | null
  totalScore?: number | null
  scoreData?: Record<string, number> | null
  pipelineData?: PipelineData | null
  notes?: string | null
}

export interface UpdateVideoEvaluationDto {
  qualityPassed?: boolean
  identifiable?: boolean
  continuity?: boolean
  jerseyNumber?: number | null
  totalScore?: number | null
  scoreData?: Record<string, number> | null
  pipelineData?: PipelineData | null
  notes?: string | null
}

export interface CreateEvaluationLogDto {
  type: EvaluationLogType
  note: string
  evaluatedAt?: string
}

export interface AcquisitionGateCheckResult {
  positionMatched: boolean
  budgetWarning: boolean
  matchedSurveys: { id: number; position: string; budgetMin: number | null; budgetMax: number | null }[]
}

export const VIDEO_EVAL_RESULT_LABEL: Record<VideoEvalResult, string> = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  PENDING: '보류',
}

export const VIDEO_EVAL_RESULT_STYLE: Record<VideoEvalResult, string> = {
  PASS: 'bg-green-100 text-green-800 border-green-200',
  FAIL: 'bg-red-100 text-red-800 border-red-200',
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
}

export const EVAL_LOG_TYPE_LABEL: Record<EvaluationLogType, string> = {
  VIDEO_ANALYSIS: '풀매치 비디오',
  CONSISTENCY: '일관성 평가',
  FIELD_VISIT: '현장 확인',
  LEAGUE_LEVEL: '리그 수준',
}

export const EVAL_LOG_TYPE_DOT: Record<EvaluationLogType, string> = {
  VIDEO_ANALYSIS: 'bg-indigo-400',
  CONSISTENCY: 'bg-violet-400',
  FIELD_VISIT: 'bg-teal-400',
  LEAGUE_LEVEL: 'bg-amber-400',
}
