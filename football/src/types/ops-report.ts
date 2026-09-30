export interface OpsSnapshotData {
  feeCollectionRate: number
  feeDelinquencyRate: number
  monthlySettlementRate: number
  budgetExecutionRate: number
  overrideCount: number
  registrationRate: number
  attendanceRate: number
  noticeReadRate: number
}

export interface BudgetCategorySnapshot {
  budget: number
  actual: number
}

export interface BudgetSnapshotData {
  snapshotData: Record<string, BudgetCategorySnapshot>
  totalBudget: number
  totalActual: number
}

export interface AnnualOpsEntry {
  year: number
  month: number
  data: OpsSnapshotData
}

export interface NoticeUnreadDrillItem {
  userId: string
  name: string
  unreadCount: number
}

export interface AttendanceDrillItem {
  playerId: string
  playerName: string
  present: number
  lateUnauth: number
  absentUnauth: number
  authorizedAbsence: number
  effectiveAbsences: number
}
