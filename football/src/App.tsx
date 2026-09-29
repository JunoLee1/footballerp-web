import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { getDefaultLanding } from '@/lib/roleLanding'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Toaster } from '@/components/ui/sonner'
import { AppShell } from '@/layouts/AppShell'
import { ConfirmProvider } from '@/lib/confirm-dialog'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { CoachDashboard } from '@/pages/dashboard/CoachDashboard'
import { LoginPage } from '@/pages/auth/LoginPage'
import InviteAcceptPage from '@/pages/auth/InviteAcceptPage'
import { PlayersPage } from '@/pages/players/PlayersPage'
import { YouthPlayersPage } from '@/pages/players/YouthPlayersPage'
import { PlayerDetailPage } from '@/pages/players/PlayerDetailPage'
import { ContractsPage } from '@/pages/contracts/ContractsPage'
import { InjuriesPage } from '@/pages/injuries/InjuriesPage'
import { InjuryDetailPage } from '@/pages/injuries/InjuryDetailPage'
import { InjuryStatsPage } from '@/pages/injuries/InjuryStatsPage'
import { TransfersPage } from '@/pages/transfers/TransfersPage'
import { PlayerCallupPage } from '@/pages/transfers/PlayerCallupPage'
import { TrainingPage } from '@/pages/training/TrainingPage'
import { TrainingDetailPage } from '@/pages/training/TrainingDetailPage'
import { TrainingAttendancePage } from '@/pages/training/TrainingAttendancePage'
import { TrainingResultsPage } from '@/pages/training/TrainingResultsPage'
import { TrainingPlayerProfilePage } from '@/pages/training/TrainingPlayerProfilePage'
import { TrainingReferencePage } from '@/pages/training/TrainingReferencePage'
import { TrainingVideoPage } from '@/pages/training/TrainingVideoPage'
import { CoachAvailabilityPage } from '@/pages/training/CoachAvailabilityPage'
import { CoachDashboardPage } from '@/pages/training/CoachDashboardPage'
import { MatchesPage } from '@/pages/matches/MatchesPage'
import { MatchDetailPage } from '@/pages/matches/MatchDetailPage'
import { MatchLineupPage } from '@/pages/matches/MatchLineupPage'
import { RankingsPage } from '@/pages/matches/RankingsPage'
import { TacticalAnalysisPage } from '@/pages/tactical/TacticalAnalysisPage'
import { AssetInventoryPage } from '@/pages/asset/AssetInventoryPage'
import { SoftwareLicensePage } from '@/pages/admin/SoftwareLicensePage'
import { AssetRequestPage } from '@/pages/asset/AssetRequestPage'
import { AssetRequestApprovalPage } from '@/pages/asset/AssetRequestApprovalPage'
import DepartmentAssetKitPage from '@/pages/asset/DepartmentAssetKitPage'
import { HiringDispatchPage } from '@/pages/hiring/HiringDispatchPage'
import { HiringDispatchApprovalPage } from '@/pages/hiring/HiringDispatchApprovalPage'
import { HiringDocumentPage } from '@/pages/hiring/HiringDocumentPage'
import OnboardingTemplateManagementPage from '@/pages/onboarding/OnboardingTemplateManagementPage'
import OnboardingChecklistPage from '@/pages/onboarding/OnboardingChecklistPage'
import OnboardingVerifyPage from '@/pages/onboarding/OnboardingVerifyPage'
import { EquipmentPage } from '@/pages/equipment/EquipmentPage'
import { FacilityPage } from '@/pages/facility/FacilityPage'
import { SponsorshipPage } from '@/pages/sponsorship/SponsorshipPage'
import { SponsorshipDetailPage } from '@/pages/sponsorship/SponsorshipDetailPage'
import { ProspectsPage } from '@/pages/prospects/ProspectsPage'
import { AcquisitionSurveysPage } from '@/pages/acquisition-surveys/AcquisitionSurveysPage'
import { NotificationsPage } from '@/pages/notifications/NotificationsPage'
import { MePage } from '@/pages/me/MePage'
import { UsersPage } from '@/pages/admin/UsersPage'
import { UserProfilePage } from '@/pages/admin/UserProfilePage'
import { PartnersPage } from '@/pages/admin/PartnersPage'
import { TeamsPage } from '@/pages/admin/TeamsPage'
import { SeasonsPage } from '@/pages/admin/SeasonsPage'
import { AuditLogPage } from '@/pages/admin/AuditLogPage'
import { LoginHistoryPage } from '@/pages/admin/LoginHistoryPage'
import SafeguardReportPage from '@/pages/admin/SafeguardReportPage'
import TeamSettingsPage from '@/pages/admin/TeamSettingsPage'
import ClubSettingsPage from '@/pages/admin/ClubSettingsPage'
import { ContractDetailPage } from '@/pages/contracts/ContractDetailPage'
import { ReportsPage } from '@/pages/reports/ReportsPage'
import { ReportFormPage } from '@/pages/reports/ReportFormPage'
import { ReportDetailPage } from '@/pages/reports/ReportDetailPage'
import { ReportApprovalPage } from '@/pages/reports/ReportApprovalPage'
import { MedicalExpensesPage } from '@/pages/medical-expense/MedicalExpensesPage'
import { HiringRoundsPage } from '@/pages/coaches/HiringRoundsPage'
import { CoachListPage } from '@/pages/coaches/CoachListPage'
import { CoachDetailPage } from '@/pages/coaches/CoachDetailPage'
import { StaffManagementPage } from '@/pages/coaching-staff/StaffManagementPage'
import { MedicalExpenseFormPage } from '@/pages/medical-expense/MedicalExpenseFormPage'
import { MedicalExpenseDetailPage } from '@/pages/medical-expense/MedicalExpenseDetailPage'
import { SquadPlannerPage } from '@/pages/squad/SquadPlannerPage'
import YouthRegistrationPage from '@/pages/youth/YouthRegistrationPage'
import { GrowthReportsListPage } from '@/pages/players/GrowthReportsListPage'
import IncidentReportPage from '@/pages/youth/IncidentReportPage'
import AcademyFeePage from '@/pages/youth/AcademyFeePage'
import GuardianPortalPage from '@/pages/youth/GuardianPortalPage'
import TossCallbackPage from '@/pages/youth/TossCallbackPage'
import { StaffRecordPage } from '@/pages/admin/StaffRecordPage'
import { ProbationReviewPage } from '@/pages/admin/ProbationReviewPage'
import { DepartmentPage } from '@/pages/admin/DepartmentPage'
import { FinancialReportPage } from '@/pages/admin/FinancialReportPage'
import { OperatingExpensePage } from '@/pages/admin/OperatingExpensePage'
import HrReportPage from '@/pages/admin/HrReportPage'
import { JobPostingListPage } from '@/pages/admin/recruitment/JobPostingListPage'
import { JobPostingDetailPage } from '@/pages/admin/recruitment/JobPostingDetailPage'
import { ApplicationDetailPage } from '@/pages/admin/recruitment/ApplicationDetailPage'
import { HiringSurveyListPage } from '@/pages/admin/recruitment/HiringSurveyListPage'
import { HiringSurveyDetailPage } from '@/pages/admin/recruitment/HiringSurveyDetailPage'
import { HiringSurveyRespondPage } from '@/pages/admin/recruitment/HiringSurveyRespondPage'
import { HiringSurveyApprovalPage } from '@/pages/admin/recruitment/HiringSurveyApprovalPage'
import { HiringSurveyDraftEditPage } from '@/pages/admin/recruitment/HiringSurveyDraftEditPage'
import { OfferApprovalPage } from '@/pages/recruitment/OfferApprovalPage'
import { PlanReportHiringItemsPage } from '@/pages/finance/PlanReportHiringItemsPage'
import DashboardCharts from '@/pages/finance/DashboardCharts'
import AccountCodesPage from '@/pages/settings/AccountCodesPage'
import BudgetDetailPage from '@/pages/finance/BudgetDetailPage'
import BudgetPage from '@/pages/budget/BudgetPage'
import { TeamSelectPage } from '@/pages/team-select/TeamSelectPage'
import { LeaguePage } from '@/pages/admin/LeaguePage'
import { TicketSalesPage } from '@/pages/finance/TicketSalesPage'
import { LedgerPage } from '@/pages/finance/LedgerPage'
import { PlanReportListPage } from '@/pages/finance/PlanReportListPage'
import { PlanReportFormPage } from '@/pages/finance/PlanReportFormPage'
import { PlanReportDetailPage } from '@/pages/finance/PlanReportDetailPage'
import { PlanReportApprovalPage } from '@/pages/plan-report/PlanReportApprovalPage'
import { DepartmentReviewConfigPage } from '@/pages/admin/DepartmentReviewConfigPage'
import { ReviewRuleSetPage } from '@/pages/admin/ReviewRuleSetPage'
import MonthlySettlementDetailPage from '@/pages/reports/MonthlySettlementDetailPage'
import PayrollPage from '@/pages/admin/PayrollPage'
import { DepartmentMembersPage } from '@/pages/department/DepartmentMembersPage'
import { DeptMembersListPage } from '@/pages/admin/DeptMembersListPage'
import { MedicalEquipmentLoanPage } from '@/pages/medical/MedicalEquipmentLoanPage'
import { MedicalEquipmentLoanDetailPage } from '@/pages/medical/MedicalEquipmentLoanDetailPage'

function RootRedirect() {
  const { user, loading } = useCurrentUser()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={getDefaultLanding(user.role, user.coachingRole, user.frontOfficeRole)} replace />
}

function PlayerMeRedirect() {
  return <Navigate to="/me" replace />
}

function GrowthReportRedirect() {
  const { playerId } = useParams<{ playerId: string }>()
  return <Navigate to={`/players/${playerId}`} replace />
}

function NavigateToBudgetDetail() {
  const { id } = useParams()
  return <Navigate to={`/budget/${id}`} replace />
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const loggedIn = localStorage.getItem('loggedIn')
  return loggedIn ? <>{children}</> : <Navigate to="/login" replace />
}

function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const isSuperAdmin = localStorage.getItem('userRole') === 'SUPER_ADMIN'
  const hasTeam = !!localStorage.getItem('superAdminTeamId')
  if (isSuperAdmin && !hasTeam) return <Navigate to="/team-select" replace />
  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <ConfirmProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/invite/:token" element={<InviteAcceptPage />} />
          <Route path="/toss-callback" element={<TossCallbackPage />} />

          <Route
            path="/team-select"
            element={
              <PrivateRoute>
                <TeamSelectPage />
              </PrivateRoute>
            }
          />

          <Route
            element={
              <PrivateRoute>
                <SuperAdminGuard>
                  <AppShell />
                </SuperAdminGuard>
              </PrivateRoute>
            }
          >
            <Route index element={<RootRedirect />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/coach-dashboard" element={<CoachDashboard />} />
            <Route path="/players" element={<PlayersPage />} />
            <Route path="/youth-players" element={<YouthPlayersPage />} />
            <Route path="/players/:id" element={<PlayerDetailPage />} />
            <Route path="/contracts" element={<ContractsPage />} />
            <Route path="/contracts/:id" element={<ContractDetailPage />} />
            <Route path="/transfers" element={<TransfersPage />} />
            <Route path="/player-callups" element={<PlayerCallupPage />} />
            <Route path="/guardian-portal" element={<GuardianPortalPage />} />
            <Route path="/youth-registrations" element={<YouthRegistrationPage />} />
            <Route path="/incident-reports" element={<IncidentReportPage />} />
            <Route path="/academy-fees" element={<AcademyFeePage />} />
            <Route path="/growth-reports" element={<GrowthReportsListPage />} />
            <Route path="/growth-reports/:playerId" element={<GrowthReportRedirect />} />
            <Route path="/injuries" element={<InjuriesPage />} />
            <Route path="/injuries/:id" element={<InjuryDetailPage />} />
            <Route path="/injuries/stats" element={<InjuryStatsPage />} />
            <Route path="/training" element={<TrainingPage />} />
            <Route path="/training/attendance" element={<TrainingAttendancePage />} />
            <Route path="/training/results" element={<TrainingResultsPage />} />
            <Route path="/training/players/:playerId" element={<TrainingPlayerProfilePage />} />
            <Route path="/training/references" element={<TrainingReferencePage />} />
            <Route path="/training/videos" element={<TrainingVideoPage />} />
            <Route path="/training/coach-availability" element={<CoachAvailabilityPage />} />
            <Route path="/training/dashboard" element={<Navigate to="/training/analysis" replace />} />
            <Route path="/training/analysis" element={<CoachDashboardPage />} />
            <Route path="/training/:id" element={<TrainingDetailPage />} />
            <Route path="/matches" element={<MatchesPage />} />
            <Route path="/matches/analysis" element={<TacticalAnalysisPage />} />
            <Route path="/squad" element={<SquadPlannerPage />} />
            <Route path="/matches/rankings" element={<RankingsPage />} />
            <Route path="/matches/:id/lineup" element={<MatchLineupPage />} />
            <Route path="/matches/:id" element={<MatchDetailPage />} />
            <Route path="/asset/inventory" element={<AssetInventoryPage />} />
            <Route path="/admin/software-licenses" element={<SoftwareLicensePage />} />
            <Route path="/asset/request" element={<AssetRequestPage />} />
            <Route path="/asset/approval" element={<AssetRequestApprovalPage />} />
            <Route path="/hiring" element={<HiringDispatchPage />} />
            <Route path="/hiring/approval" element={<HiringDispatchApprovalPage />} />
            <Route path="/hiring/dispatches/:dispatchId/documents" element={<HiringDocumentPage />} />
            <Route path="/hiring/applications/:applicationId/documents" element={<HiringDocumentPage />} />
            <Route
              path="/departments/:departmentId/onboarding-template"
              element={<OnboardingTemplateManagementPage />}
            />
            <Route
              path="/departments/:departmentId/asset-kit"
              element={<DepartmentAssetKitPage />}
            />
            <Route
              path="/onboarding/:onboardingId/checklist"
              element={<OnboardingChecklistPage />}
            />
            <Route path="/hr/onboarding-verify" element={<OnboardingVerifyPage />} />
            <Route path="/equipment" element={<EquipmentPage />} />
            <Route path="/facility" element={<FacilityPage />} />
            <Route path="/sponsorship" element={<SponsorshipPage />} />
            <Route path="/sponsorship/:id" element={<SponsorshipDetailPage />} />
            <Route path="/prospects" element={<ProspectsPage />} />
            <Route path="/acquisition-surveys" element={<AcquisitionSurveysPage />} />
            <Route path="/acquisition-surveys/:id" element={<AcquisitionSurveysPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/me" element={<MePage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/reports/new" element={<ReportFormPage />} />
            <Route path="/reports/approval" element={<ReportApprovalPage />} />
            <Route path="/reports/monthly/:year/:month" element={<MonthlySettlementDetailPage />} />
            <Route path="/reports/:id" element={<ReportDetailPage />} />
            <Route path="/medical-expenses" element={<MedicalExpensesPage />} />
            <Route path="/medical-expenses/new" element={<MedicalExpenseFormPage />} />
            <Route path="/medical-expenses/:id/edit" element={<MedicalExpenseFormPage />} />
            <Route path="/medical-expenses/:id" element={<MedicalExpenseDetailPage />} />
            <Route path="/admin/partners" element={<PartnersPage />} />
            <Route path="/coaches/rounds" element={<HiringRoundsPage />} />
            <Route path="/coaches" element={<CoachListPage />} />
            <Route path="/coaches/:id" element={<CoachDetailPage />} />
            <Route path="/coaching-staff/management" element={<StaffManagementPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/users/:id/profile" element={<UserProfilePage />} />
            <Route path="/admin/teams" element={<TeamsPage />} />
            <Route path="/admin/seasons" element={<SeasonsPage />} />
            <Route path="/admin/audit-logs" element={<AuditLogPage />} />
            <Route path="/admin/login-history" element={<LoginHistoryPage />} />
            <Route path="/safeguard-reports" element={<SafeguardReportPage />} />
            <Route path="/admin/team-settings" element={<TeamSettingsPage />} />
            <Route path="/admin/club-settings" element={<ClubSettingsPage />} />
            <Route path="/admin/departments" element={<DepartmentPage />} />
            <Route path="/admin/staff-records" element={<StaffRecordPage />} />
            <Route path="/admin/probation-reviews" element={<ProbationReviewPage />} />
            <Route path="/admin/financial-report" element={<FinancialReportPage />} />
            {/* 예산 통합 페이지 */}
            <Route path="/budget" element={<BudgetPage />} />
            <Route path="/budget/:id" element={<BudgetDetailPage />} />

            {/* 기존 경로 리다이렉트 */}
            <Route path="/admin/budget-plan" element={<Navigate to="/budget?tab=plan" replace />} />
            <Route path="/admin/operating-expenses" element={<OperatingExpensePage />} />
            <Route path="/admin/hr-report" element={<HrReportPage />} />
            <Route path="/admin/recruitment" element={<JobPostingListPage />} />
            <Route path="/admin/recruitment/postings/:id" element={<JobPostingDetailPage />} />
            <Route path="/admin/recruitment/applications/:id" element={<ApplicationDetailPage />} />
            <Route path="/admin/recruitment/surveys" element={<HiringSurveyListPage />} />
            <Route path="/admin/recruitment/surveys/:id/edit" element={<HiringSurveyDraftEditPage />} />
            <Route path="/admin/recruitment/surveys/:id/respond" element={<HiringSurveyRespondPage />} />
            <Route path="/admin/recruitment/surveys/:id/approve" element={<HiringSurveyApprovalPage />} />
            <Route path="/admin/recruitment/surveys/:id" element={<HiringSurveyDetailPage />} />
            <Route path="/recruitment/offer-approval" element={<OfferApprovalPage />} />
            <Route path="/finance/plan-reports/:id/hiring-items" element={<PlanReportHiringItemsPage />} />
            <Route path="/admin/leagues" element={<LeaguePage />} />
            <Route path="/finance/ticket-sales" element={<TicketSalesPage />} />
            <Route path="/finance/ledger" element={<LedgerPage />} />
            <Route path="/admin/department-review-configs" element={<DepartmentReviewConfigPage />} />
            <Route path="/admin/review-rule-sets" element={<ReviewRuleSetPage />} />
            <Route path="/finance/plan-reports" element={<PlanReportListPage />} />
            <Route path="/finance/plan-reports/new" element={<PlanReportFormPage />} />
            <Route path="/finance/plan-reports/:id/edit" element={<PlanReportFormPage />} />
            <Route path="/finance/plan-reports/:id" element={<PlanReportDetailPage />} />
            <Route path="/finance/plan-reports/approval" element={<PlanReportApprovalPage />} />
            <Route path="/finance/budget" element={<Navigate to="/budget?tab=execution" replace />} />
            <Route path="/finance/budget/auto" element={<Navigate to="/budget?tab=auto" replace />} />
            <Route path="/finance/budget/:id" element={<NavigateToBudgetDetail />} />
            <Route path="/finance/dashboard" element={<DashboardCharts />} />
            <Route path="/settings/account-codes" element={<AccountCodesPage />} />
            <Route path="/admin/payroll" element={<PayrollPage />} />
            <Route path="/admin/department-members" element={<DeptMembersListPage />} />
            <Route path="/admin/department-members/:deptId" element={<DepartmentMembersPage />} />
            <Route path="/medical/equipment-loan" element={<MedicalEquipmentLoanPage />} />
            <Route path="/medical/equipment-loan/:id" element={<MedicalEquipmentLoanDetailPage />} />
            <Route path="/player/me" element={<PlayerMeRedirect />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        <Toaster richColors position="top-right" />
      </ConfirmProvider>
    </BrowserRouter>
  )
}

export default App
