import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SafeguardButton } from '@/components/layout/SafeguardButton'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useLanguage } from '@/hooks/useLanguage'
import { useLiteMode } from '@/hooks/useLiteMode'
import { useConfirm } from '@/lib/confirm-dialog'
import { useApiPending } from '@/lib/useApiPending'
import { authApi } from '@/services/auth.service'
import i18n from '@/i18n'
import { notificationApi } from '@/services/notification.service'
import { isAdminLike } from '@/lib/permissions'
import { NotificationPopover } from '@/components/common/NotificationPopover'
import { connectSocket, disconnectSocket } from '@/lib/socket'
import { usePlayerNotification } from '@/hooks/usePlayerNotification'
import { usePartnerNotification } from '@/hooks/usePartnerNotification'
import { useReportNotification } from '@/hooks/useReportNotification'
import { useAcquisitionSurveyNotification } from '@/hooks/useAcquisitionSurveyNotification'
import { Switch } from '@/components/ui/switch'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
  Activity,
  AlertTriangle,
  ArrowUpCircle,
  Banknote,
  BarChart2,
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarX2,
  ChevronRight,
  ClipboardList,
  Cpu,
  ListChecks,
  CreditCard,
  FileClock,
  FileText,
  Flag,
  GraduationCap,
  Handshake,
  History,
  LayoutDashboard,
  LayoutGrid,
  type LucideIcon,
  Menu,
  Boxes,
  ClipboardCheck,
  FilePlus2,
  Package,
  Receipt,
  ScrollText,
  Settings,
  Shield,
  SlidersHorizontal,
  Stethoscope,
  Ticket,
  TrendingUp,
  Trophy,
  User,
  UserPlus,
  UserSearch,
  Users,
  Users2,
  Video,
  Wallet,
  Warehouse,
  Wrench,
  Lock,
  KeyRound,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  COACHING_ROLE_LABEL,
  FRONT_OFFICE_ROLE_LABEL,
  ROLE_LABEL,
  type CoachingRole,
  type FrontOfficeRole,
  type Role,
} from '@/types/auth'
import { getSectionOrder } from '@/lib/sectionOrder'

type TeamCtx = 'FIRST_TEAM' | 'YOUTH'
const TeamContext = createContext<TeamCtx>('FIRST_TEAM')
export const useTeamContext = () => useContext(TeamContext)

type NavSubSection = 'nav.subsection.hr' | 'nav.subsection.finance' | 'nav.subsection.facilityAssets' | 'nav.subsection.system'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  section?: 'nav.section.playerMgmt' | 'nav.section.contractTransfer' | 'nav.section.injuryMedical' | 'nav.section.training' | 'nav.section.matchAnalysis' | 'nav.section.youth' | 'nav.section.coachingStaff' | 'nav.section.management' | 'nav.section.docApproval'
  subSection?: NavSubSection
  roles?: Role[]
  coachingRoles?: CoachingRole[]
  frontOfficeRoles?: FrontOfficeRole[]
  anyDeptCategory?: boolean
  description?: string
  liteBlocked?: boolean
  teamCtx?: TeamCtx
}


const MANAGEMENT_SUBSECTION_ORDER: NavSubSection[] = [
  'nav.subsection.hr',
  'nav.subsection.finance',
  'nav.subsection.facilityAssets',
  'nav.subsection.system',
]

const SUBSECTION_ICON: Record<NavSubSection, LucideIcon> = {
  'nav.subsection.hr': Users,
  'nav.subsection.finance': Banknote,
  'nav.subsection.facilityAssets': Warehouse,
  'nav.subsection.system': Cpu,
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'nav.item.dashboard', icon: BarChart3, end: true, roles: ['ADMIN', 'SUPER_ADMIN', 'GM', 'FRONT_OFFICE', 'COACHING_STAFF', 'AGENT'] },
  // 자산 신청 워크플로우 — 신청은 모든 스태프, 결재함은 항상 표시 (백엔드가 pending 목록 필터).
  // 결재 대기가 없으면 페이지에서 empty-state 노출 (Task 6 spec §Step 6).
  {
    to: '/asset/request',
    label: 'nav.item.assetRequest',
    icon: FilePlus2,
    end: true,
    roles: ['ADMIN', 'GM', 'FRONT_OFFICE', 'COACHING_STAFF'],
  },
  {
    to: '/asset/approval',
    label: 'nav.item.assetRequestApproval',
    icon: ClipboardCheck,
    end: true,
    roles: ['ADMIN', 'GM', 'FRONT_OFFICE', 'COACHING_STAFF'],
  },
  {
    to: '/guardian-portal',
    label: 'nav.item.guardianPortal',
    icon: Users2,
    end: true,
    roles: ['GUARDIAN'],
  },
  {
    to: '/coach-dashboard',
    label: 'nav.item.coachOverview',
    icon: LayoutDashboard,
    end: true,
    roles: ['COACHING_STAFF', 'ADMIN'],
    coachingRoles: ['HEAD_COACH', 'ASSISTANT_COACH'],
  },

  // 선수 관리
  {
    to: '/players',
    label: 'nav.item.playerList',
    icon: Users,
    section: 'nav.section.playerMgmt',
    end: true,
    roles: ['ADMIN', 'FRONT_OFFICE', 'COACHING_STAFF'],
    teamCtx: 'FIRST_TEAM',
  },
  {
    to: '/youth-players',
    label: 'nav.item.youthPlayers',
    icon: GraduationCap,
    section: 'nav.section.playerMgmt',
    end: true,
    roles: ['ADMIN', 'FRONT_OFFICE', 'COACHING_STAFF'],
    teamCtx: 'YOUTH',
  },
  {
    to: '/prospects',
    label: 'nav.item.prospects',
    icon: UserSearch,
    section: 'nav.section.playerMgmt',
    roles: ['ADMIN', 'FRONT_OFFICE', 'COACHING_STAFF'],
  },

  // 계약·영입
  {
    to: '/contracts',
    label: 'nav.item.contractList',
    icon: ScrollText,
    section: 'nav.section.contractTransfer',
    roles: ['ADMIN', 'FRONT_OFFICE'],
  },
  {
    to: '/transfers',
    label: 'nav.item.transferStatus',
    icon: Activity,
    section: 'nav.section.contractTransfer',
    roles: ['ADMIN', 'FRONT_OFFICE'],
  },
  {
    to: '/player-callups',
    label: 'nav.item.youthCallup',
    icon: ArrowUpCircle,
    section: 'nav.section.contractTransfer',
    roles: ['ADMIN', 'FRONT_OFFICE', 'COACHING_STAFF'],
    coachingRoles: ['HEAD_COACH'],
  },
  {
    to: '/coaches/rounds',
    label: 'nav.item.coachHiring',
    icon: Briefcase,
    section: 'nav.section.contractTransfer',
    roles: ['ADMIN', 'FRONT_OFFICE'],
    frontOfficeRoles: ['TD'],
  },

  // 부상·의료
  {
    to: '/injuries',
    label: 'nav.item.injuryStatus',
    icon: Stethoscope,
    section: 'nav.section.injuryMedical',
    end: true,
    roles: ['ADMIN', 'FRONT_OFFICE', 'COACHING_STAFF'],
  },
  {
    to: '/injuries/stats',
    label: 'nav.item.injuryStats',
    icon: TrendingUp,
    section: 'nav.section.injuryMedical',
    roles: ['ADMIN', 'COACHING_STAFF'],
    coachingRoles: ['HEAD_COACH', 'ASSISTANT_COACH', 'MEDICAL', 'MEDICAL_DIRECTOR'],
  },
  {
    to: '/medical-expenses',
    label: 'nav.item.medicalExpenses',
    icon: Receipt,
    section: 'nav.section.injuryMedical',
    roles: ['ADMIN', 'COACHING_STAFF'],
    coachingRoles: ['MEDICAL', 'MEDICAL_DIRECTOR'],
  },
  {
    to: '/medical/equipment-loan',
    label: 'nav.item.medicalEquipmentLoan',
    icon: Package,
    section: 'nav.section.injuryMedical',
    roles: ['ADMIN', 'COACHING_STAFF'],
    coachingRoles: ['MEDICAL', 'MEDICAL_DIRECTOR'],
  },

  // 훈련
  {
    to: '/training',
    label: 'nav.item.trainingSchedule',
    icon: ClipboardList,
    section: 'nav.section.training',
    end: true,
    roles: ['ADMIN', 'COACHING_STAFF', 'PLAYER'],
  },
  {
    to: '/training/attendance',
    label: 'nav.item.attendance',
    icon: Shield,
    section: 'nav.section.training',
    roles: ['ADMIN', 'COACHING_STAFF'],
  },
  {
    to: '/training/results',
    label: 'nav.item.trainingResults',
    icon: BarChart2,
    section: 'nav.section.training',
    roles: ['ADMIN', 'COACHING_STAFF'],
  },
  {
    to: '/training/videos',
    label: 'nav.item.trainingVideos',
    icon: Video,
    section: 'nav.section.training',
    roles: ['ADMIN', 'COACHING_STAFF'],
  },
  {
    to: '/training/references',
    label: 'nav.item.tacticalReferences',
    icon: BookOpen,
    section: 'nav.section.training',
    roles: ['ADMIN', 'COACHING_STAFF'],
  },
  {
    to: '/training/coach-availability',
    label: 'nav.item.coachAvailability',
    icon: CalendarX2,
    section: 'nav.section.training',
    roles: ['ADMIN', 'COACHING_STAFF'],
  },
  {
    to: '/training/analysis',
    label: 'nav.item.coachDashboard',
    icon: LayoutDashboard,
    section: 'nav.section.training',
    roles: ['COACHING_STAFF'],
  },

  // 경기·분석
  {
    to: '/matches',
    label: 'nav.item.matchList',
    icon: Trophy,
    section: 'nav.section.matchAnalysis',
    end: true,
    roles: ['ADMIN', 'COACHING_STAFF', 'PLAYER'],
  },
  {
    to: '/matches/analysis',
    label: 'nav.item.tacticalAnalysis',
    icon: FileText,
    section: 'nav.section.matchAnalysis',
    roles: ['ADMIN', 'COACHING_STAFF'],
  },
  {
    to: '/matches/rankings',
    label: 'nav.item.rankings',
    icon: BarChart3,
    section: 'nav.section.matchAnalysis',
    roles: ['ADMIN', 'SUPER_ADMIN', 'GM', 'FRONT_OFFICE', 'COACHING_STAFF', 'AGENT'],
  },
  {
    to: '/squad',
    label: 'nav.item.teamBuilder',
    icon: LayoutGrid,
    section: 'nav.section.matchAnalysis',
    roles: ['ADMIN', 'COACHING_STAFF'],
  },

  // 유소년
  {
    to: '/youth-registrations',
    label: 'nav.item.youthRegistrations',
    icon: ClipboardList,
    section: 'nav.section.youth',
    roles: ['ADMIN', 'FRONT_OFFICE', 'COACHING_STAFF', 'GUARDIAN'],
    teamCtx: 'YOUTH',
  },
  {
    to: '/incident-reports',
    label: 'nav.item.incidentReports',
    icon: AlertTriangle,
    section: 'nav.section.youth',
    roles: ['ADMIN', 'FRONT_OFFICE', 'COACHING_STAFF'],
    teamCtx: 'YOUTH',
  },
  {
    to: '/growth-reports',
    label: 'nav.item.growthReports',
    icon: TrendingUp,
    section: 'nav.section.youth',
    roles: ['ADMIN', 'COACHING_STAFF', 'GUARDIAN'],
    teamCtx: 'YOUTH',
  },
  {
    to: '/academy-fees',
    label: 'nav.item.academyFees',
    icon: Wallet,
    section: 'nav.section.youth',
    roles: ['ADMIN', 'FRONT_OFFICE'],
    liteBlocked: true,
    teamCtx: 'YOUTH',
  },

  // 코칭스태프
  {
    to: '/coaching-staff/management',
    label: 'nav.item.staffMgmt',
    icon: Users2,
    section: 'nav.section.coachingStaff',
    roles: ['ADMIN', 'COACHING_STAFF'],
    coachingRoles: ['HEAD_COACH'],
  },

  // 문서·결재
  {
    to: '/reports',
    label: 'nav.item.reportApproval',
    icon: FileText,
    section: 'nav.section.docApproval',
    roles: ['ADMIN', 'FRONT_OFFICE', 'COACHING_STAFF'],
    frontOfficeRoles: ['TD', 'HR_MANAGER', 'HR_STAFF', 'FINANCE_MANAGER', 'FINANCE_STAFF', 'ASSET_MANAGER', 'ASSET_STAFF', 'SCOUT'],
    anyDeptCategory: true,
  },
  {
    to: '/reports/approval',
    label: 'nav.item.reportApprovalInbox',
    icon: ClipboardCheck,
    section: 'nav.section.docApproval',
    end: true,
    roles: ['ADMIN', 'GM', 'FRONT_OFFICE', 'COACHING_STAFF'],
    frontOfficeRoles: ['HR_MANAGER', 'ASSET_MANAGER', 'FINANCE_MANAGER'],
    coachingRoles: ['HEAD_COACH'],
  },
  {
    to: '/finance/plan-reports',
    label: 'nav.item.planReports',
    icon: ClipboardList,
    section: 'nav.section.docApproval',
    roles: ['ADMIN', 'FRONT_OFFICE', 'COACHING_STAFF'],
    frontOfficeRoles: ['TD', 'HR_MANAGER', 'FINANCE_MANAGER', 'FINANCE_STAFF', 'ASSET_MANAGER'],
  },
  {
    to: '/finance/plan-reports/approval',
    label: 'nav.item.planReportApproval',
    icon: ClipboardCheck,
    section: 'nav.section.docApproval',
    end: true,
    roles: ['ADMIN', 'GM', 'FRONT_OFFICE'],
    frontOfficeRoles: ['TD', 'HR_MANAGER', 'FINANCE_MANAGER', 'ASSET_MANAGER'],
  },

  // 관리 > 인사
  {
    to: '/admin/department-members',
    label: 'nav.item.myTeamMembers',
    icon: Users,
    section: 'nav.section.management',
    subSection: 'nav.subsection.hr',
    roles: ['ADMIN', 'SUPER_ADMIN', 'GM', 'FRONT_OFFICE'],
    anyDeptCategory: true,
  },
  {
    to: '/admin/departments',
    label: 'nav.item.departments',
    icon: Building2,
    section: 'nav.section.management',
    subSection: 'nav.subsection.hr',
    roles: ['ADMIN'],
  },
  {
    to: '/admin/department-review-configs',
    label: 'nav.item.departmentReviewConfigs',
    icon: ClipboardList,
    section: 'nav.section.management',
    subSection: 'nav.subsection.hr',
    roles: ['ADMIN'],
  },
  {
    to: '/admin/staff-records',
    label: 'nav.item.staffRecords',
    icon: Users2,
    section: 'nav.section.management',
    subSection: 'nav.subsection.hr',
    roles: ['ADMIN'],
  },
  {
    to: '/admin/probation-reviews',
    label: 'nav.item.probationReviews',
    icon: Users2,
    section: 'nav.section.management',
    subSection: 'nav.subsection.hr',
    roles: ['ADMIN', 'FRONT_OFFICE'],
    frontOfficeRoles: ['HR_MANAGER'],
  },
  {
    to: '/sponsorship',
    label: 'nav.item.sponsorship',
    icon: Handshake,
    section: 'nav.section.management',
    roles: ['ADMIN', 'FRONT_OFFICE'],
    frontOfficeRoles: ['FINANCE_MANAGER', 'FINANCE_STAFF'],
  },
  {
    to: '/admin/hr-report',
    label: 'nav.item.hrStats',
    icon: ClipboardList,
    section: 'nav.section.management',
    subSection: 'nav.subsection.hr',
    roles: ['ADMIN', 'FRONT_OFFICE'],
  },
  {
    to: '/admin/recruitment',
    label: 'nav.item.recruitment',
    icon: UserPlus,
    section: 'nav.section.management',
    subSection: 'nav.subsection.hr',
    roles: ['ADMIN', 'FRONT_OFFICE'],
    frontOfficeRoles: ['HR_MANAGER'],
  },
  {
    to: '/admin/recruitment/surveys',
    label: 'nav.item.hiringSurvey',
    icon: ClipboardList,
    section: 'nav.section.management',
    subSection: 'nav.subsection.hr',
    roles: ['ADMIN', 'FRONT_OFFICE'],
    frontOfficeRoles: ['HR_MANAGER'],
  },
  // 채용 발령: HR 이 요청을 생성하고 재무·임원·HR 3단계 결재를 거쳐 실행됨.
  // 리스트 페이지는 HR/관리자가 요청을 생성하는 곳, 결재함은 재무/임원/HR 어느
  // 단계든 참여 가능한 사용자에게 노출 (백엔드가 pending 목록 필터).
  {
    to: '/hiring',
    label: 'nav.item.hiringDispatch',
    icon: UserPlus,
    section: 'nav.section.management',
    subSection: 'nav.subsection.hr',
    roles: ['ADMIN', 'FRONT_OFFICE'],
    frontOfficeRoles: ['HR_MANAGER'],
  },
  {
    to: '/hiring/approval',
    label: 'nav.item.hiringDispatchApproval',
    icon: ClipboardCheck,
    section: 'nav.section.management',
    subSection: 'nav.subsection.hr',
    roles: ['ADMIN', 'FRONT_OFFICE'],
    frontOfficeRoles: ['FINANCE_MANAGER', 'HR_MANAGER'],
  },
  // #370 — offer 3-stage approval (팀장/부서장/HR). Every FO user might be a
  // team leader or department head, so we show the link broadly and let the
  // backend filter the queue per stage. HR sees all three tabs; non-HR see
  // empty tabs for stages they aren't assigned to.
  {
    to: '/recruitment/offer-approval',
    label: 'nav.item.offerApproval',
    icon: ClipboardCheck,
    section: 'nav.section.management',
    subSection: 'nav.subsection.hr',
    roles: ['ADMIN', 'FRONT_OFFICE', 'COACHING_STAFF'],
  },

  // 관리 > 재무
  {
    to: '/admin/financial-report',
    label: 'nav.item.financialStats',
    icon: TrendingUp,
    section: 'nav.section.management',
    subSection: 'nav.subsection.finance',
    roles: ['ADMIN', 'FRONT_OFFICE'],
    frontOfficeRoles: ['FINANCE_MANAGER', 'FINANCE_STAFF'],
  },
  {
    to: '/budget',
    label: 'nav.item.budget',
    icon: Wallet,
    section: 'nav.section.management',
    subSection: 'nav.subsection.finance',
    roles: ['ADMIN', 'SUPER_ADMIN', 'GM', 'FRONT_OFFICE'],
  },
  {
    to: '/admin/operating-expenses',
    label: 'nav.item.operatingExpenses',
    icon: CreditCard,
    section: 'nav.section.management',
    subSection: 'nav.subsection.finance',
    roles: ['ADMIN', 'FRONT_OFFICE'],
    frontOfficeRoles: ['FINANCE_MANAGER', 'FINANCE_STAFF', 'TD'],
  },
  {
    to: '/finance/ticket-sales',
    label: 'nav.item.ticketSales',
    icon: Ticket,
    section: 'nav.section.management',
    subSection: 'nav.subsection.finance',
    roles: ['ADMIN', 'FRONT_OFFICE'],
    frontOfficeRoles: ['FINANCE_MANAGER', 'FINANCE_STAFF'],
  },
  {
    to: '/finance/ledger',
    label: 'nav.item.ledger',
    icon: Lock,
    section: 'nav.section.management',
    subSection: 'nav.subsection.finance',
    roles: ['ADMIN', 'SUPER_ADMIN', 'GM', 'FRONT_OFFICE'],
    frontOfficeRoles: ['FINANCE_MANAGER'],
  },
  {
    to: '/admin/payroll',
    label: 'nav.item.payroll',
    icon: Banknote,
    section: 'nav.section.management',
    subSection: 'nav.subsection.finance',
    roles: ['ADMIN', 'SUPER_ADMIN', 'GM', 'FRONT_OFFICE'],
    frontOfficeRoles: ['FINANCE_MANAGER', 'HR_MANAGER'],
  },
  {
    to: '/finance/dashboard',
    label: 'nav.item.financeDashboard',
    icon: BarChart2,
    section: 'nav.section.management',
    subSection: 'nav.subsection.finance',
    roles: ['ADMIN', 'SUPER_ADMIN', 'GM', 'FRONT_OFFICE'],
    frontOfficeRoles: ['FINANCE_MANAGER', 'FINANCE_STAFF'],
  },
  // 관리 > 시설·자산
  {
    to: '/equipment',
    label: 'nav.item.equipment',
    icon: Package,
    section: 'nav.section.management',
    subSection: 'nav.subsection.facilityAssets',
    roles: ['ADMIN', 'FRONT_OFFICE'],
  },
  {
    to: '/facility',
    label: 'nav.item.facilityMgmt',
    icon: Wrench,
    section: 'nav.section.management',
    subSection: 'nav.subsection.facilityAssets',
    roles: ['ADMIN', 'FRONT_OFFICE'],
    frontOfficeRoles: ['FACILITY_MANAGER', 'FACILITY_STAFF'],
  },
  {
    to: '/asset/inventory',
    label: 'nav.item.assetInventory',
    icon: Boxes,
    section: 'nav.section.management',
    subSection: 'nav.subsection.facilityAssets',
    roles: ['ADMIN', 'FRONT_OFFICE'],
    frontOfficeRoles: ['ASSET_MANAGER', 'ASSET_STAFF'],
  },
  {
    to: '/admin/partners',
    label: 'nav.item.partnerMgmt',
    icon: Handshake,
    section: 'nav.section.management',
    subSection: 'nav.subsection.facilityAssets',
    roles: ['ADMIN', 'FRONT_OFFICE'],
    frontOfficeRoles: ['ASSET_MANAGER', 'ASSET_STAFF', 'EQUIPMENT_MANAGER'],
  },

  // 관리 > 시스템
  {
    to: '/admin/users',
    label: 'nav.item.userMgmt',
    icon: Settings,
    section: 'nav.section.management',
    subSection: 'nav.subsection.system',
    roles: ['ADMIN'],
  },
  {
    to: '/admin/teams',
    label: 'nav.item.teamMgmt',
    icon: Flag,
    section: 'nav.section.management',
    subSection: 'nav.subsection.system',
    roles: ['ADMIN'],
  },
  {
    to: '/admin/seasons',
    label: 'nav.item.seasonMgmt',
    icon: CalendarDays,
    section: 'nav.section.management',
    subSection: 'nav.subsection.system',
    roles: ['ADMIN'],
  },
  {
    to: '/admin/audit-logs',
    label: 'nav.item.auditLogs',
    icon: FileClock,
    section: 'nav.section.management',
    subSection: 'nav.subsection.system',
    roles: ['ADMIN'],
  },
  {
    to: '/admin/login-history',
    label: 'nav.item.loginHistory',
    icon: History,
    section: 'nav.section.management',
    subSection: 'nav.subsection.system',
    roles: ['ADMIN'],
  },
  {
    to: '/safeguard-reports',
    label: 'nav.item.safeguardReports',
    icon: Shield,
    section: 'nav.section.management',
    subSection: 'nav.subsection.system',
    roles: ['ADMIN'],
  },
  {
    to: '/admin/review-rule-sets',
    label: 'nav.item.reviewRuleSets',
    icon: ListChecks,
    section: 'nav.section.management',
    subSection: 'nav.subsection.system',
    roles: ['ADMIN'],
  },
  {
    to: '/admin/team-settings',
    label: 'nav.item.teamSettings',
    icon: SlidersHorizontal,
    section: 'nav.section.management',
    subSection: 'nav.subsection.system',
    roles: ['ADMIN'],
  },
  {
    to: '/admin/club-settings',
    label: 'nav.item.clubSettings',
    icon: Settings,
    section: 'nav.section.management',
    subSection: 'nav.subsection.system',
    roles: ['ADMIN', 'SUPER_ADMIN'],
  },
  {
    to: '/settings/account-codes',
    label: 'nav.item.accountCodes',
    icon: SlidersHorizontal,
    section: 'nav.section.management',
    subSection: 'nav.subsection.system',
    roles: ['ADMIN'],
  },
  {
    to: '/admin/leagues',
    label: 'nav.item.leagueMgmt',
    icon: Trophy,
    section: 'nav.section.management',
    subSection: 'nav.subsection.system',
    roles: ['SUPER_ADMIN'],
  },
  {
    to: '/admin/software-licenses',
    label: 'nav.item.softwareLicenses',
    icon: KeyRound,
    section: 'nav.section.management',
    subSection: 'nav.subsection.system',
    roles: ['ADMIN', 'SUPER_ADMIN', 'GM', 'FRONT_OFFICE'],
    frontOfficeRoles: ['ASSET_MANAGER', 'ASSET_STAFF'],
  },

  // PLAYER 전용
  {
    to: '/player/me',
    label: 'nav.item.myProfile',
    icon: User,
    end: true,
    roles: ['PLAYER'],
  },
  {
    to: '/injuries',
    label: 'nav.item.myInjuries',
    icon: Stethoscope,
    end: true,
    section: 'nav.section.injuryMedical',
    roles: ['PLAYER'],
  },
  {
    to: '/training/attendance',
    label: 'nav.item.myAttendance',
    icon: CalendarCheck,
    end: true,
    section: 'nav.section.training',
    roles: ['PLAYER'],
  },
]

export function AppShell() {
  const { t } = useTranslation('common')
  const { user, loading } = useCurrentUser()
  const { language, changeLanguage } = useLanguage(
    (localStorage.getItem('app_lang') as 'ko' | 'en') ?? user?.language ?? 'ko'
  )
  const isLite = useLiteMode()
  const navigate = useNavigate()
  const location = useLocation()
  const confirm = useConfirm()
  const apiPending = useApiPending()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [openSection, setOpenSection] = useState<string | null>(() => {
    const found = NAV_ITEMS.find((item) => {
      if (!item.section) return false
      if (item.end) return location.pathname === item.to
      return location.pathname === item.to || location.pathname.startsWith(item.to + '/')
    })
    return found?.section ?? null
  })

  const [openSubSections, setOpenSubSections] = useState<Set<string>>(() => {
    const found = NAV_ITEMS.find((item) => {
      if (!item.subSection) return false
      if (item.end) return location.pathname === item.to
      return location.pathname === item.to || location.pathname.startsWith(item.to + '/')
    })
    return found?.subSection ? new Set([found.subSection]) : new Set()
  })

  const [teamCtx, setTeamCtx] = useState<TeamCtx>(() => {
    const superAdminTeamType = localStorage.getItem('superAdminTeamType')
    if (superAdminTeamType === 'YOUTH') return 'YOUTH'
    if (superAdminTeamType) return 'FIRST_TEAM'
    return (localStorage.getItem('teamCtx') as TeamCtx) ?? 'FIRST_TEAM'
  })

  const switchTeamCtx = (v: TeamCtx) => {
    setTeamCtx(v)
    localStorage.setItem('teamCtx', v)
  }

  useEffect(() => {
    const activeItem = NAV_ITEMS.find((item) => {
      if (item.end) return location.pathname === item.to
      return location.pathname === item.to || location.pathname.startsWith(item.to + '/')
    })
    if (activeItem?.section) {
      setOpenSection(activeItem.section)
    }
    if (activeItem?.subSection) {
      setOpenSubSections((prev) => new Set([...prev, activeItem.subSection!]))
    }
  }, [location.pathname])

  const refreshUnread = useCallback(() => {
    notificationApi
      .my()
      .then((items) => setUnreadCount(items.filter((n) => !n.readAt).length))
      .catch(() => null)
  }, [])

  useEffect(() => {
    if (!user) return
    refreshUnread()
    const timer = setInterval(refreshUnread, 30_000)
    return () => clearInterval(timer)
  }, [user, refreshUnread])

  useEffect(() => {
    if (!user) return
    connectSocket()
    return () => disconnectSocket()
  }, [user])


  usePlayerNotification(refreshUnread)
  usePartnerNotification(user?.role)
  useReportNotification(refreshUnread)
  useAcquisitionSurveyNotification(refreshUnread)

  const clearLocalSession = () => {
    authApi.logout()
    void i18n.changeLanguage('ko')
    navigate('/login')
  }

  const handleLogout = async () => {
    const ok = await confirm({
      title: t('nav.logoutConfirm.title'),
      description: t('nav.logoutConfirm.description'),
      confirmText: t('nav.logoutConfirm.confirmText'),
    })
    if (!ok) return
    clearLocalSession()
  }

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.liteBlocked && isLite) return false
    if (item.teamCtx && item.teamCtx !== teamCtx && user?.role !== 'GUARDIAN') return false
    if (!item.roles) return true
    if (!user) return false
    if (user.role === 'SUPER_ADMIN' || user.role === 'GM') return true
    if (!item.roles.includes(user.role)) return false
    if (item.coachingRoles && user.role === 'COACHING_STAFF') {
      return user.coachingRole !== null && item.coachingRoles.includes(user.coachingRole)
    }
    if (item.frontOfficeRoles && user.role === 'FRONT_OFFICE') {
      const roleMatch = user.frontOfficeRole !== null && item.frontOfficeRoles.includes(user.frontOfficeRole)
      const deptMatch = item.anyDeptCategory === true && (user.departmentCategories?.length ?? 0) > 0
      return roleMatch || deptMatch
    }
    return true
  })

  const sectionOrder = getSectionOrder(user?.role ?? 'ADMIN', user?.coachingRole, user?.frontOfficeRole)

  const navGroups: Array<{ section: string | null; items: NavItem[] }> = []
  const rootItems = visibleNavItems.filter((i) => !i.section)
  if (rootItems.length > 0) navGroups.push({ section: null, items: rootItems })
  for (const s of sectionOrder) {
    const items = visibleNavItems.filter((i) => i.section === s)
    if (items.length > 0) navGroups.push({ section: s, items })
  }
  // sectionOrder에 없는 섹션도 끝에 추가 (안전망)
  const sectionOrderSet = new Set<string>(sectionOrder)
  const remainingSections = [...new Set(
    visibleNavItems.filter((i) => i.section && !sectionOrderSet.has(i.section)).map((i) => i.section!)
  )]
  for (const s of remainingSections) {
    const items = visibleNavItems.filter((i) => i.section === s)
    if (items.length > 0) navGroups.push({ section: s, items })
  }

  const isItemActive = (item: NavItem) => {
    if (item.end) return location.pathname === item.to
    return location.pathname === item.to || location.pathname.startsWith(item.to + '/')
  }

  const renderNavLink = (item: NavItem, onClick?: () => void) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      onClick={onClick}
      title={item.description}
      className={() => {
        const active = isItemActive(item)
        return `flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
          active
            ? 'bg-accent text-accent-foreground font-medium'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
        }`
      }}
    >
      <item.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="flex-1">{t(item.label)}</span>
    </NavLink>
  )

  const toggleSubSection = (sub: string) => {
    setOpenSubSections((prev) => {
      const next = new Set(prev)
      if (next.has(sub)) next.delete(sub)
      else next.add(sub)
      return next
    })
  }

  const renderManagementSubSections = (items: NavItem[], onClick?: () => void) => {
    const rootItems = items.filter((i) => !i.subSection)
    return (
      <div className="space-y-0.5 mt-1 ml-3 pl-2 border-l border-border/60">
        {rootItems.map((item) => renderNavLink(item, onClick))}
        {MANAGEMENT_SUBSECTION_ORDER.map((sub) => {
          const subItems = items.filter((i) => i.subSection === sub)
          if (subItems.length === 0) return null
          const isSubOpen = openSubSections.has(sub)
          const hasSubActive = subItems.some(isItemActive)
          const SubIcon = SUBSECTION_ICON[sub]
          return (
            <div key={sub} className="pt-2">
              <button
                type="button"
                aria-expanded={isSubOpen}
                onClick={(e) => {
                  toggleSubSection(sub)
                  e.currentTarget.blur()
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors group"
              >
                <SubIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" aria-hidden />
                <span className="flex-1 text-xs font-semibold text-foreground/75 group-hover:text-foreground tracking-wide transition-colors">
                  {t(sub)}
                </span>
                {hasSubActive && !isSubOpen && (
                  <span className="h-1.5 w-1.5 rounded-full bg-foreground/50 shrink-0" aria-label="이 소분류에 현재 페이지 있음" />
                )}
                <ChevronRight
                  className={cn('h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform group-hover:text-muted-foreground', isSubOpen && 'rotate-90')}
                  aria-hidden
                />
              </button>
              {isSubOpen && (
                <div className="space-y-0.5 mt-0.5 ml-4 border-l border-border/40 pl-2">
                  {subItems.map((item) => renderNavLink(item, onClick))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const renderNavGroups = (onClick?: () => void) =>
    navGroups.map((g, idx) => {
      if (g.section === null) {
        return (
          <div key="__root__" className="space-y-1">
            {g.items.map((item) => renderNavLink(item, onClick))}
          </div>
        )
      }
      const isOpen = openSection === g.section
      const hasActive = g.items.some(isItemActive)
      return (
        <div key={g.section} className={idx > 0 ? 'pt-3' : ''}>
          <button
            type="button"
            aria-expanded={isOpen}
            onClick={(e) => {
              setOpenSection(isOpen ? null : g.section)
              e.currentTarget.blur()
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-semibold text-foreground/80 hover:bg-accent/50 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors"
          >
            <ChevronRight
              className={cn('h-3 w-3 transition-transform shrink-0', isOpen && 'rotate-90')}
              aria-hidden
            />
            <span className="flex-1 text-left">{t(g.section!)}</span>
            {hasActive && !isOpen && (
              <span
                className="h-1.5 w-1.5 rounded-full bg-foreground"
                aria-label="이 섹션에 현재 페이지 있음"
              />
            )}
          </button>
          {isOpen && (
            g.section === 'nav.section.management'
              ? renderManagementSubSections(g.items, onClick)
              : (
                <div className="space-y-1 mt-1 ml-3 pl-2 border-l border-border/60">
                  {g.items.map((item) => renderNavLink(item, onClick))}
                </div>
              )
          )}
        </div>
      )
    })

  const userSubLabel = () => {
    if (!user) return ''
    if (user.role === 'COACHING_STAFF' && user.coachingRole) {
      return COACHING_ROLE_LABEL[user.coachingRole]
    }
    if (user.role === 'FRONT_OFFICE' && user.frontOfficeRole) {
      return FRONT_OFFICE_ROLE_LABEL[user.frontOfficeRole]
    }
    return ROLE_LABEL[user.role]
  }

  const SidebarNav = ({ onNavClick }: { onNavClick?: () => void }) => (
    <>
      {user && !['PLAYER', 'GUARDIAN', 'SUPER_ADMIN'].includes(user.role) && (
        <div className="px-3 py-2 border-b">
          <div className="flex rounded-md bg-muted p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => switchTeamCtx('FIRST_TEAM')}
              className={cn('flex-1 text-xs px-2 py-1 rounded transition-colors', teamCtx === 'FIRST_TEAM' ? 'bg-background shadow-sm text-foreground font-medium' : 'text-muted-foreground hover:text-foreground')}
            >
              1군
            </button>
            <button
              type="button"
              onClick={() => switchTeamCtx('YOUTH')}
              className={cn('flex-1 text-xs px-2 py-1 rounded transition-colors', teamCtx === 'YOUTH' ? 'bg-background shadow-sm text-foreground font-medium' : 'text-muted-foreground hover:text-foreground')}
            >
              유소년
            </button>
          </div>
        </div>
      )}
      <nav
        className={`flex-1 px-2 py-3 transition-opacity ${
          apiPending ? 'opacity-50' : ''
        }`}
        aria-busy={apiPending}
      >
        {renderNavGroups(onNavClick)}
      </nav>

      <div className="border-t p-3">
        {loading || !user ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <NavLink
            to="/me"
            onClick={onNavClick}
            className={({ isActive }) =>
              `flex items-center gap-3 px-2 py-1.5 rounded-md transition-colors ${
                isActive ? 'bg-accent' : 'hover:bg-accent/50'
              }`
            }
            title="내 정보"
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{user.nickname.slice(0, 1)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{user.nickname}</p>
              <p className="text-xs text-muted-foreground truncate">{userSubLabel()}</p>
            </div>
          </NavLink>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 text-muted-foreground"
          onClick={() => {
            onNavClick?.()
            void handleLogout()
          }}
        >
          {t('nav.logout')}
        </Button>
      </div>
    </>
  )

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* 데스크탑 사이드바 */}
      <aside className="w-60 border-r bg-card hidden md:flex flex-col overflow-hidden">
        <div className="px-4 h-14 border-b flex items-center shrink-0">
          <h1 className="text-base font-semibold tracking-tight">Football ERP</h1>
        </div>

        {user?.role === 'SUPER_ADMIN' && (
          <div className="px-3 py-2.5 border-b">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground truncate">
                  {localStorage.getItem('superAdminClubName') ?? '구단 미선택'}
                </p>
                <p className="text-xs font-medium truncate">
                  {localStorage.getItem('superAdminTeamName') ?? '-'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/team-select')}
                className="text-xs text-muted-foreground hover:text-foreground shrink-0 transition-colors"
              >
                변경
              </button>
            </div>
          </div>
        )}

        {user && !['PLAYER', 'GUARDIAN', 'SUPER_ADMIN'].includes(user.role) && (
          <div className="px-3 py-2 border-b">
            <div className="flex rounded-md bg-muted p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => switchTeamCtx('FIRST_TEAM')}
                className={cn('flex-1 text-xs px-2 py-1 rounded transition-colors', teamCtx === 'FIRST_TEAM' ? 'bg-background shadow-sm text-foreground font-medium' : 'text-muted-foreground hover:text-foreground')}
              >
                1군
              </button>
              <button
                type="button"
                onClick={() => switchTeamCtx('YOUTH')}
                className={cn('flex-1 text-xs px-2 py-1 rounded transition-colors', teamCtx === 'YOUTH' ? 'bg-background shadow-sm text-foreground font-medium' : 'text-muted-foreground hover:text-foreground')}
              >
                유소년
              </button>
            </div>
          </div>
        )}

        <nav
          className={`flex-1 px-2 py-3 overflow-y-auto transition-opacity ${
            apiPending ? 'opacity-50' : ''
          }`}
          aria-busy={apiPending}
        >
          {renderNavGroups()}
        </nav>

        <div className="border-t p-3">
          {loading || !user ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <NavLink
              to="/me"
              className={({ isActive }) =>
                `flex items-center gap-3 px-2 py-1.5 rounded-md transition-colors ${
                  isActive ? 'bg-accent' : 'hover:bg-accent/50'
                }`
              }
              title="내 정보"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">{user.nickname.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{user.nickname}</p>
                <p className="text-xs text-muted-foreground truncate">{userSubLabel()}</p>
              </div>
            </NavLink>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-2 text-muted-foreground"
            onClick={() => void handleLogout()}
          >
            {t('nav.logout')}
          </Button>
        </div>
      </aside>

      {/* 모바일 햄버거 드로어 */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent showCloseButton>
          <SheetHeader>
            <SheetTitle>Football ERP</SheetTitle>
          </SheetHeader>
          <SidebarNav onNavClick={() => setMobileMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* 메인 컨텐츠 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 데스크탑 상단 헤더 */}
        <header className="hidden md:flex items-center justify-end gap-3 px-4 h-14 border-b bg-card shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground select-none">
            <span className={language === 'ko' ? 'text-foreground font-medium' : ''}>KO</span>
            <Switch
              checked={language === 'en'}
              onCheckedChange={() => void changeLanguage(language === 'ko' ? 'en' : 'ko')}
              aria-label={language === 'ko' ? 'Switch to English' : '한국어로 전환'}
            />
            <span className={language === 'en' ? 'text-foreground font-medium' : ''}>EN</span>
          </div>
          <NotificationPopover
            unreadCount={unreadCount}
            onUnreadCountChange={setUnreadCount}
            iconSize="sm"
          />
        </header>

        {/* 모바일 상단 헤더 */}
        <header className="md:hidden flex items-center gap-3 px-4 h-14 border-b bg-card shrink-0">
          <Button
            variant="ghost"
            size="icon"
            aria-label="메뉴 열기"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="flex-1 text-base font-semibold tracking-tight">Football ERP</span>
          <div className="flex items-center gap-1 text-xs text-muted-foreground select-none">
            <span className={language === 'ko' ? 'text-foreground font-medium' : ''}>KO</span>
            <Switch
              checked={language === 'en'}
              onCheckedChange={() => void changeLanguage(language === 'ko' ? 'en' : 'ko')}
              aria-label={language === 'ko' ? 'Switch to English' : '한국어로 전환'}
            />
            <span className={language === 'en' ? 'text-foreground font-medium' : ''}>EN</span>
          </div>
          <NotificationPopover
            unreadCount={unreadCount}
            onUnreadCountChange={setUnreadCount}
            iconSize="md"
          />
        </header>

        <main
          className={`flex-1 overflow-auto transition-opacity ${
            apiPending ? 'pointer-events-none opacity-60' : ''
          }`}
          aria-busy={apiPending}
        >
          <TeamContext.Provider value={teamCtx}>
            <Outlet />
          </TeamContext.Provider>
        </main>
      </div>
      <SafeguardButton />
    </div>
  )
}
