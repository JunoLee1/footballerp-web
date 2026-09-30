import { Request } from "express";
import { Role } from '../generated/enums'
import { AppError } from './appError'

export const Permission = {
  SYSTEM_MANAGE: 'SYSTEM_MANAGE',
  FINANCE_APPROVE: 'FINANCE_APPROVE',
  VIEW_TEAM_RANKING: 'VIEW_TEAM_RANKING',
} as const

export type Permission = (typeof Permission)[keyof typeof Permission]

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: [Permission.SYSTEM_MANAGE, Permission.FINANCE_APPROVE, Permission.VIEW_TEAM_RANKING],
  SUPER_ADMIN: [Permission.SYSTEM_MANAGE, Permission.FINANCE_APPROVE, Permission.VIEW_TEAM_RANKING],
  GM: [Permission.SYSTEM_MANAGE, Permission.FINANCE_APPROVE, Permission.VIEW_TEAM_RANKING],
  FRONT_OFFICE: [Permission.VIEW_TEAM_RANKING],
  COACHING_STAFF: [Permission.VIEW_TEAM_RANKING],
  PLAYER: [Permission.VIEW_TEAM_RANKING],
  AGENT: [],
  GUARDIAN: [],
}

export const isSuperAdmin = (user: Express.User): boolean =>
  user.role === 'SUPER_ADMIN'

export const isAdminLike = (role: string): boolean =>
  role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'GM'

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function requireSuperAdmin(req: Request): void {
  if (req.user?.role !== 'SUPER_ADMIN') {
    throw new AppError(403, 'FORBIDDEN')
  }
}

export const canReadFinance = (role: string, foRole?: string | null, deptCategories?: string[]): boolean =>
  isAdminLike(role) ||
  (role === 'FRONT_OFFICE' && (foRole === 'FINANCE_MANAGER' || foRole === 'FINANCE_STAFF')) ||
  (deptCategories?.includes('FINANCE') ?? false)

export const canWriteFinance = (role: string, foRole?: string | null, deptCategories?: string[]): boolean =>
  isAdminLike(role) ||
  (role === 'FRONT_OFFICE' && foRole === 'FINANCE_MANAGER') ||
  (deptCategories?.includes('FINANCE') ?? false)

export const canReadHR = (role: string, foRole?: string | null, deptCategories?: string[]): boolean =>
  isAdminLike(role) ||
  (role === 'FRONT_OFFICE' && (foRole === 'HR_MANAGER' || foRole === 'HR_STAFF')) ||
  (deptCategories?.includes('HR') ?? false)

export const canWriteHR = (role: string, foRole?: string | null, deptCategories?: string[]): boolean =>
  isAdminLike(role) ||
  (role === 'FRONT_OFFICE' && foRole === 'HR_MANAGER') ||
  (deptCategories?.includes('HR') ?? false)

// 급여 도메인은 Finance + HR 이 함께 접근 (HR: 급여 계산/4대보험/원천세, Finance: 예산/승인)
// 관련 이슈 #565 · 스펙 docs/superpowers/specs/2026-09-29-payroll-role-guard-design.md
export const canReadPayroll = (role: string, foRole?: string | null, deptCategories?: string[]): boolean =>
  canReadFinance(role, foRole, deptCategories) || canReadHR(role, foRole, deptCategories)

export const canWritePayroll = (role: string, foRole?: string | null, deptCategories?: string[]): boolean =>
  canWriteFinance(role, foRole, deptCategories) || canWriteHR(role, foRole, deptCategories)

export const canReadFacility = (role: string, foRole?: string | null, deptCategories?: string[]): boolean =>
  isAdminLike(role) ||
  (role === 'FRONT_OFFICE' && (foRole === 'FACILITY_MANAGER' || foRole === 'FACILITY_STAFF')) ||
  (deptCategories?.includes('OPERATIONS') ?? false)

export const canWriteFacility = (role: string, foRole?: string | null, deptCategories?: string[]): boolean =>
  isAdminLike(role) ||
  (role === 'FRONT_OFFICE' && foRole === 'FACILITY_MANAGER') ||
  (deptCategories?.includes('OPERATIONS') ?? false)

export const canManageTD = (role: string, foRole?: string | null): boolean =>
  isAdminLike(role) ||
  (role === 'FRONT_OFFICE' && foRole === 'TD')

export const canReadActiveInjury = (role: string, coachingRole?: string | null, deptCategories?: string[]): boolean =>
  isAdminLike(role) ||
  role === 'COACHING_STAFF' ||
  (role === 'FRONT_OFFICE' && coachingRole === 'TD') ||
  (deptCategories?.includes('PERFORMANCE') ?? false)

export const canReadInjuryReport = (role: string, coachingRole?: string | null, deptCategories?: string[]): boolean =>
  isAdminLike(role) ||
  (role === 'COACHING_STAFF' && (coachingRole === 'MEDICAL' || coachingRole === 'MEDICAL_DIRECTOR')) ||
  (deptCategories?.includes('PERFORMANCE') ?? false)

export const isHeadCoach = (role: string, coachingRole?: string | null): boolean =>
  role === 'COACHING_STAFF' && coachingRole === 'HEAD_COACH'

/**
 * ADMIN은 자신의 클럽 데이터만 접근 가능.
 * SUPER_ADMIN은 클럽 무관 전체 접근.
 * targetClubId가 null이면 클럽 미배정 리소스 — ADMIN 접근 불가.
 */
export function assertClubAccess(req: Request, targetClubId: string | null | undefined): void {
  const user = req.user;
  if (!user) throw new AppError(401, 'UNAUTHORIZED');
  if (user.role === 'SUPER_ADMIN') return;
  if (!user.clubId) return;
  if (!targetClubId || user.clubId !== targetClubId) {
    throw new AppError(404, 'NOT_FOUND');
  }
}

/**
 * 스코핑용 clubId 획득. Phase 2.5: clubId=null 유저의 크로스클럽 접근 차단.
 * - SUPER_ADMIN: undefined (전 클럽 조회 허용)
 * - clubId 있음: 그 값
 * - 그 외 (clubId=null 인 일반 유저): 403 throw
 */
export function requireClubScope(user: Express.User): string | undefined {
  if (user.role === 'SUPER_ADMIN') return user.clubId ?? undefined;
  if (user.clubId != null) return user.clubId;
  throw new AppError(403, 'CLUB_SCOPE_REQUIRED');
}

export function canApprovePlan(userRole: string, requiredLevel: string | null): boolean {
  switch (requiredLevel ?? 'HEAD') {
    case 'HEAD':
    case 'GM':
      return isAdminLike(userRole)
    case 'ADMIN':
      return userRole === 'ADMIN' || userRole === 'SUPER_ADMIN'
    default:
      return false
  }
}

/**
 * 의무기기 대여 요청 가능 여부
 * CoachingRole MEDICAL / MEDICAL_DIRECTOR, PERFORMANCE 부서 카테고리, 또는 isAdminLike
 */
export function canRequestMedicalEquipmentLoan(user: {
  role: string;
  coachingRole?: string | null;
  departmentCategories?: string[];
}): boolean {
  if (isAdminLike(user.role)) return true;
  if (user.coachingRole === "MEDICAL" || user.coachingRole === "MEDICAL_DIRECTOR") return true;
  return user.departmentCategories?.includes('PERFORMANCE') ?? false;
}

/**
 * 의무기기 대여 승인 가능 여부 (일반 + 사후 승인)
 * CoachingRole MEDICAL_DIRECTOR, PERFORMANCE 부서 카테고리, 또는 isAdminLike
 */
export function canApproveMedicalEquipmentLoan(user: {
  role: string;
  coachingRole?: string | null;
  departmentCategories?: string[];
}): boolean {
  if (isAdminLike(user.role)) return true;
  if (user.coachingRole === "MEDICAL_DIRECTOR") return true;
  return user.departmentCategories?.includes('PERFORMANCE') ?? false;
}

export const canReadProspect = (role: string, coachingRole?: string | null, deptCategories?: string[]): boolean =>
  isAdminLike(role) ||
  role === 'FRONT_OFFICE' ||
  (role === 'COACHING_STAFF' && coachingRole === 'HEAD_COACH') ||
  (deptCategories?.includes('PERFORMANCE') ?? false)

export const canWriteProspect = (role: string, frontOfficeRole?: string | null): boolean =>
  isAdminLike(role) ||
  role === 'GM' ||
  (role === 'FRONT_OFFICE' && frontOfficeRole === 'SCOUT')

export const canSignProspect = (role: string, frontOfficeRole?: string | null): boolean =>
  isAdminLike(role) ||
  role === 'GM' ||
  (role === 'FRONT_OFFICE' && (frontOfficeRole === 'TD' || frontOfficeRole === 'CONTRACT_MANAGER'))

export const canReadPerformance = (role: string, coachingRole?: string | null, deptCategories?: string[]): boolean =>
  isAdminLike(role) ||
  role === 'COACHING_STAFF' ||
  (deptCategories?.includes('PERFORMANCE') ?? false)

export const canWritePerformance = (role: string, coachingRole?: string | null, deptCategories?: string[]): boolean =>
  isAdminLike(role) ||
  (role === 'COACHING_STAFF' && !!coachingRole) ||
  (deptCategories?.includes('PERFORMANCE') ?? false)
