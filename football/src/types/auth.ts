export type Role = 'ADMIN' | 'SUPER_ADMIN' | 'GM' | 'FRONT_OFFICE' | 'COACHING_STAFF' | 'PLAYER' | 'AGENT' | 'GUARDIAN'

export type CoachingRole =
  | 'HEAD_COACH'
  | 'ASSISTANT_COACH'
  | 'DEFENSIVE_COACH'
  | 'ATTACKING_COACH'
  | 'PHYSICAL_COACH'
  | 'SET_PIECE_COACH'
  | 'GOALKEEPER_COACH'
  | 'MEDICAL'
  | 'MEDICAL_DIRECTOR'

export type FrontOfficeRole =
  | 'TD'
  | 'CONTRACT_MANAGER'
  | 'SCOUT'
  | 'EQUIPMENT_MANAGER'
  | 'TACTICAL_ANALYST'
  | 'FINANCE_MANAGER'
  | 'ASSET_MANAGER'
  | 'HR_MANAGER'
  | 'FACILITY_MANAGER'
  | 'HR_STAFF'
  | 'ASSET_STAFF'
  | 'FINANCE_STAFF'
  | 'FACILITY_STAFF'

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
  GM: '단장 (GM)',
  FRONT_OFFICE: 'Front Office',
  COACHING_STAFF: 'Coaching Staff',
  PLAYER: 'Player',
  AGENT: 'Agent',
  GUARDIAN: 'Guardian',
}

export const COACHING_ROLE_LABEL: Record<CoachingRole, string> = {
  HEAD_COACH: 'Head Coach',
  ASSISTANT_COACH: 'Assistant Coach',
  DEFENSIVE_COACH: 'Defensive Coach',
  ATTACKING_COACH: 'Attacking Coach',
  PHYSICAL_COACH: 'Physical Coach',
  SET_PIECE_COACH: 'Set Piece Coach',
  GOALKEEPER_COACH: 'Goalkeeper Coach',
  MEDICAL: 'Medical',
  MEDICAL_DIRECTOR: 'Medical Director',
}

export const FRONT_OFFICE_ROLE_LABEL: Record<FrontOfficeRole, string> = {
  TD: 'Technical Director',
  CONTRACT_MANAGER: 'Contract Manager',
  SCOUT: 'Scout',
  EQUIPMENT_MANAGER: 'Equipment Manager',
  TACTICAL_ANALYST: 'Tactical Analyst',
  FINANCE_MANAGER: 'Finance Manager',
  ASSET_MANAGER: 'Asset Manager',
  HR_MANAGER: 'HR Manager',
  FACILITY_MANAGER: 'Facility Manager',
  HR_STAFF: 'HR Staff',
  ASSET_STAFF: 'Asset Staff',
  FINANCE_STAFF: 'Finance Staff',
  FACILITY_STAFF: 'Facility Staff',
}

export interface UserDto {
  id: string
  email: string
  username: string
  nickname: string
  role: Role
  coachingRole: CoachingRole | null
  frontOfficeRole: FrontOfficeRole | null
  departmentCategories: string[]
  teamId: number | null
  clubId: number | null
  isOutOfOffice: boolean
  language: 'ko' | 'en'
  homeAddress: string | null
  passwordChangedAt: string | null
  phone: string | null
  team: { id: number; type: string } | null
  club: { id: number; name: string } | null
  departmentMemberships: Array<{
    role: string;
    jobTitle: { id: number; label: string } | null;
    department: { id: number; name: string };
  }>
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
}
