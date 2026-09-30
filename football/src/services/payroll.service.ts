import { api } from './api'

export interface PayrollConfig {
  id: number
  country: string
  insuranceType: string
  employeeRate: number
  employerRate: number
  effectiveFrom: string
}

export interface StaffAllowance {
  id: number
  type: string
  amount: number
  note: string | null
}

export interface StaffSalary {
  id: number
  baseSalary: number
  country: string
  effectiveFrom: string
  effectiveTo: string | null
  userId: string | null
  staffRecordId: number | null
  allowances: StaffAllowance[]
}

export interface PayrollRun {
  id: number
  staffSalaryId: number
  month: string
  grossPay: number
  totalDeductions: number
  netPay: number
  status: 'PENDING' | 'CONFIRMED' | 'LOCKED'
  confirmedById: string | null
  confirmedAt: string | null
  secondApprovedById: string | null
  secondApprovedAt: string | null
  isLocked: boolean
}

export const payrollApi = {
  // Config
  listConfigs: () => api.get<PayrollConfig[]>('/payroll/configs'),
  createConfig: (payload: { country: string; insuranceType: string; employeeRate: number; employerRate: number; effectiveFrom: string }) =>
    api.post<PayrollConfig>('/payroll/configs', payload),
  updateConfig: (id: number, payload: { employeeRate?: number; employerRate?: number }) =>
    api.patch<PayrollConfig>(`/payroll/configs/${id}`, payload),

  // Salary
  listSalaries: () => api.get<StaffSalary[]>('/payroll/salaries'),
  getSalary: (id: number) => api.get<StaffSalary>(`/payroll/salaries/${id}`),
  createSalary: (payload: { baseSalary: number; country: string; effectiveFrom: string; userId?: string; staffRecordId?: number }) =>
    api.post<StaffSalary>('/payroll/salaries', payload),
  updateSalary: (id: number, payload: { baseSalary?: number; effectiveTo?: string }) =>
    api.patch<StaffSalary>(`/payroll/salaries/${id}`, payload),

  // Allowance
  listAllowances: (salaryId: number) => api.get<StaffAllowance[]>(`/payroll/salaries/${salaryId}/allowances`),
  createAllowance: (salaryId: number, payload: { type: string; amount: number; note?: string }) =>
    api.post<StaffAllowance>(`/payroll/salaries/${salaryId}/allowances`, payload),
  updateAllowance: (salaryId: number, aid: number, payload: { amount?: number; note?: string }) =>
    api.patch<StaffAllowance>(`/payroll/salaries/${salaryId}/allowances/${aid}`, payload),
  removeAllowance: (salaryId: number, aid: number) =>
    api.delete<void>(`/payroll/salaries/${salaryId}/allowances/${aid}`),

  // Run
  listRuns: (salaryId: number) => api.get<PayrollRun[]>(`/payroll/salaries/${salaryId}/runs`),
  createRun: (salaryId: number, payload: { month: string }) =>
    api.post<PayrollRun>(`/payroll/salaries/${salaryId}/runs`, payload),
  confirmRun: (salaryId: number, runId: number) =>
    api.patch<PayrollRun>(`/payroll/salaries/${salaryId}/runs/${runId}`, {}),
  secondApproveRun: (salaryId: number, runId: number) =>
    api.post<PayrollRun>(`/payroll/salaries/${salaryId}/runs/${runId}/second-approve`, {}),
}
