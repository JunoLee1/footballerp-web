import {
  CoachingRole, CoachStatus, HiringRoundStatus,
  TutorType, LanguageProficiency, ShortlistSource,
} from "../../generated/enums";

// ─── HiringRound ────────────────────────────────────────────────────────────
export interface CreateHiringRoundDto {
  targetRole: CoachingRole;
  fitScoreThreshold?: number;
  deadline?: string;
  budget?: number;
  notes?: string;
  createdById: string;
}

export interface UpdateHiringRoundStatusDto {
  status: HiringRoundStatus;
  result?: string;
}

// ─── Coach ──────────────────────────────────────────────────────────────────
export interface CreateCoachDto {
  name: string;
  nationality?: string;
  coachingRole: CoachingRole;
  notes?: string;
  hiringRoundId?: number;
  packageLeadId?: number;
}

export interface UpdateCoachDto {
  name?: string;
  nationality?: string;
  notes?: string;
  packageLeadId?: number;
}

export interface TransitionCoachStatusDto {
  status: CoachStatus;
  shortlistSource?: ShortlistSource; // Required only when status === "SHORTLISTED"
}

// ─── Evaluation ─────────────────────────────────────────────────────────────
export interface UpsertHeadCoachEvalDto {
  possession?: number;
  pressingIntensity?: number;
  progressivePassAccuracy?: number;
  teamActivity?: number;
  philosophyFitScore?: number;
  dataSource?: string;
  evaluatedAt?: string;
}

export interface UpsertDefensiveEvalDto {
  tackleSuccessRate?: number;
  clearances?: number;
  blocks?: number;
  defensiveErrors?: number;
  ballRecovery?: number;
  pressingIntensity?: number;
  dataSource?: string;
  evaluatedAt?: string;
}

export interface UpsertAttackingEvalDto {
  xG?: number;
  xA?: number;
  chanceCreation?: number;
  dribbleSuccessRate?: number;
  progressivePassAccuracy?: number;
  shotConversionRate?: number;
  goalInvolvement?: number;
  dataSource?: string;
  evaluatedAt?: string;
}

export interface UpsertGoalkeeperEvalDto {
  psxG?: number;
  xGConcededDiff?: number;
  buildupPassAccuracy?: number;
  dataSource?: string;
  evaluatedAt?: string;
}

export interface UpsertTier2EvalDto {
  fitScore?: number;
  notes?: string;
  evaluatedAt?: string;
}

// ─── TutorAssignment ────────────────────────────────────────────────────────
export interface CreateTutorAssignmentDto {
  type: TutorType;
  internalTutorId?: string;
  externalName?: string;
  externalContact?: string;
  sessionCount?: number;
  languageProficiency?: LanguageProficiency;
}

export interface UpdateTutorAssignmentDto {
  sessionCount?: number;
  languageProficiency?: LanguageProficiency;
  tacticalImplementationRate?: number;
}
