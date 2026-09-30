export type BodyPart =
  | 'HEAD_FACE' | 'NECK_SHOULDER' | 'TORSO_BACK'
  | 'THIGH_FRONT' | 'THIGH_BACK' | 'KNEE'
  | 'SHIN_CALF' | 'ANKLE' | 'FOOT_TOE' | 'OTHER'

export const BODY_PART_LABEL: Record<BodyPart, string> = {
  HEAD_FACE:      'Head/Face',
  NECK_SHOULDER:  'Neck/Shoulder',
  TORSO_BACK:     'Torso/Back',
  THIGH_FRONT:    'Thigh (Front)',
  THIGH_BACK:     'Thigh (Back)',
  KNEE:           'Knee',
  SHIN_CALF:      'Shin/Calf',
  ANKLE:          'Ankle',
  FOOT_TOE:       'Foot/Toe',
  OTHER:          'Other',
}

export const BODY_PARTS: BodyPart[] = [
  'HEAD_FACE', 'NECK_SHOULDER', 'TORSO_BACK',
  'THIGH_FRONT', 'THIGH_BACK', 'KNEE',
  'SHIN_CALF', 'ANKLE', 'FOOT_TOE', 'OTHER',
]

export type InjuryCause = 'TRAINING' | 'MATCH' | 'OTHER'
export type InjuryStatus =
  | 'OCCURRED'
  | 'DIAGNOSED'
  | 'REHABILITATING'
  | 'READY_TO_RETURN'
  | 'RETURNED'
export type HospitalType = 'ACCREDITED' | 'GENERAL'

export interface Injury {
  id: string
  bodyPart: BodyPart
  cause: InjuryCause
  status: InjuryStatus
  occurredAt: string
  expectedReturnDate: string | null
  playerId: string
  medicalStaffId: string
  hospitalType: HospitalType | null
  hospitalId: number | null
  customHospitalName: string | null
  hospital: { id: number; name: string } | null
}

export interface InjuryDetail extends Injury {
  player: { playerName: string; position: string }
  medicalStaff: { username: string }
}

export const CAUSE_LABEL: Record<InjuryCause, string> = {
  TRAINING: 'Training',
  MATCH: 'Match',
  OTHER: 'Other',
}

export const INJURY_STATUS_LABEL: Record<InjuryStatus, string> = {
  OCCURRED: 'Occurred',
  DIAGNOSED: 'Diagnosed',
  REHABILITATING: 'Rehabilitating',
  READY_TO_RETURN: 'Ready to Return',
  RETURNED: 'Returned',
}

export const INJURY_STATUS_STYLE: Record<InjuryStatus, string> = {
  OCCURRED: 'bg-red-100 text-red-800 border-red-200',
  DIAGNOSED: 'bg-orange-100 text-orange-800 border-orange-200',
  REHABILITATING: 'bg-amber-100 text-amber-800 border-amber-200',
  READY_TO_RETURN: 'bg-blue-100 text-blue-800 border-blue-200',
  RETURNED: 'bg-green-100 text-green-800 border-green-200',
}

export type RehabStage =
  | 'INITIAL_TREATMENT'
  | 'ACUTE_TREATMENT'
  | 'REHABILITATION'
  | 'RETURN_TRAINING'
  | 'CLEARED'

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'
export type SecurityLevel = 'INTERNAL' | 'MEDICAL' | 'PRIVATE'

export interface InjuryReport {
  id: string
  injuryId: string
  diagnosisName: string | null
  treatmentContent: string | null
  rehabStage: RehabStage | null
  trainingReturnDate: string | null
  matchAvailable: boolean | null
  reinjuryRisk: RiskLevel | null
  medicalOpinion: string | null
  rehabLoadPercentage: number | null
  allowedActivities: string | null
  securityLevel: SecurityLevel
  createdById: string
  updatedById: string | null
  createdAt: string
  updatedAt: string
  createdBy: { id: string; nickname: string }
  updatedBy: { id: string; nickname: string } | null
  coachSignedAt: string | null
  coachSignedById: string | null
  coachSigner: { id: string; nickname: string } | null
  trainerSignedAt: string | null
  trainerSignedById: string | null
  trainerSigner: { id: string; nickname: string } | null
  medicalSignedAt: string | null
  medicalSignedById: string | null
  medicalSigner: { id: string; nickname: string } | null
}

export const REHAB_STAGE_LABEL: Record<RehabStage, string> = {
  INITIAL_TREATMENT: 'Initial Treatment',
  ACUTE_TREATMENT: 'Acute Treatment',
  REHABILITATION: 'Rehabilitation',
  RETURN_TRAINING: 'Return Training',
  CLEARED: 'Cleared',
}

export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
}

export const RISK_LEVEL_STYLE: Record<RiskLevel, string> = {
  LOW: 'bg-green-50 text-green-700 border-green-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  HIGH: 'bg-red-50 text-red-700 border-red-200',
}

export const SECURITY_LEVEL_LABEL: Record<SecurityLevel, string> = {
  INTERNAL: 'Internal',
  MEDICAL: 'Medical Staff Only',
  PRIVATE: 'Player + Medical',
}

export interface InjuryAssessment {
  id: number
  injuryId: string
  painLevel: number
  hasSwelling: boolean
  romScore: number
  strengthScore: number
  sprintScore: number
  jumpScore: number
  psychScore: number
  positionRiskScore: number
  medicalScore: number
  functionalScore: number
  modifierScore: number
  totalScore: number
  assessedAt: string
}

export type ExternalReportTarget =
  | 'EDUCATION_OFFICE' | 'SCHOOL_SAFETY'
  | 'LEAGUE' | 'FEDERATION' | 'INSURANCE'

export type ExternalReportStatus =
  | 'PENDING_SUBMISSION' | 'SUBMITTED' | 'SUPPLEMENT_REQUESTED' | 'COMPLETED'

export const EXTERNAL_REPORT_TARGET_LABEL: Record<ExternalReportTarget, string> = {
  EDUCATION_OFFICE: 'Education Office',
  SCHOOL_SAFETY:    'School Safety Board',
  LEAGUE:           'League',
  FEDERATION:       'Federation',
  INSURANCE:        'Insurance',
}

export const EXTERNAL_REPORT_STATUS_LABEL: Record<ExternalReportStatus, string> = {
  PENDING_SUBMISSION:   'Pending Submission',
  SUBMITTED:            'Submitted',
  SUPPLEMENT_REQUESTED: 'Supplement Requested',
  COMPLETED:            'Completed',
}

export const EXTERNAL_REPORT_STATUS_STYLE: Record<ExternalReportStatus, string> = {
  PENDING_SUBMISSION:   'bg-orange-50 text-orange-700 border-orange-200',
  SUBMITTED:            'bg-blue-50 text-blue-700 border-blue-200',
  SUPPLEMENT_REQUESTED: 'bg-amber-50 text-amber-700 border-amber-200',
  COMPLETED:            'bg-green-50 text-green-700 border-green-200',
}

export interface ExternalReport {
  id: number
  injuryId: string
  target: ExternalReportTarget
  status: ExternalReportStatus
  reportData: Record<string, unknown>
  dueDate: string | null
  submittedAt: string | null
  submittedNote: string | null
  createdAt: string
}
