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
  id: string
  baseSalary: number
  country: string
  effectiveFrom: string
  effectiveTo: string | null
  userId: string | null
  staffRecordId: number | null
  allowances: StaffAllowance[]
}

export interface PayrollRun {
  id: string
  staffSalaryId: string
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
  getSalary: (id: string) => api.get<StaffSalary>(`/payroll/salaries/${id}`),
  createSalary: (payload: { baseSalary: number; country: string; effectiveFrom: string; userId?: string; staffRecordId?: number }) =>
    api.post<StaffSalary>('/payroll/salaries', payload),
  updateSalary: (id: string, payload: { baseSalary?: number; effectiveTo?: string }) =>
    api.patch<StaffSalary>(`/payroll/salaries/${id}`, payload),

  // Allowance
  listAllowances: (salaryId: string) => api.get<StaffAllowance[]>(`/payroll/salaries/${salaryId}/allowances`),
  createAllowance: (salaryId: string, payload: { type: string; amount: number; note?: string }) =>
    api.post<StaffAllowance>(`/payroll/salaries/${salaryId}/allowances`, payload),
  updateAllowance: (salaryId: string, aid: number, payload: { amount?: number; note?: string }) =>
    api.patch<StaffAllowance>(`/payroll/salaries/${salaryId}/allowances/${aid}`, payload),
  removeAllowance: (salaryId: string, aid: number) =>
    api.delete<void>(`/payroll/salaries/${salaryId}/allowances/${aid}`),

  // Run
  listRuns: (salaryId: string) => api.get<PayrollRun[]>(`/payroll/salaries/${salaryId}/runs`),
  createRun: (salaryId: string, payload: { month: string }) =>
    api.post<PayrollRun>(`/payroll/salaries/${salaryId}/runs`, payload),
  confirmRun: (salaryId: string, runId: string) =>
    api.patch<PayrollRun>(`/payroll/salaries/${salaryId}/runs/${runId}`, {}),
  secondApproveRun: (salaryId: string, runId: string) =>
    api.post<PayrollRun>(`/payroll/salaries/${salaryId}/runs/${runId}/second-approve`, {}),
}
