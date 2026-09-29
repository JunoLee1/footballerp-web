export type EquipmentCategory =
  | 'CLOTHING'
  | 'FOOTWEAR'
  | 'BALL_AND_TOOLS'
  | 'REHABILITATION'
  | 'TACTICAL'
  | 'OTHER'

export type EquipmentUnitStatus = 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'RETIRED'

export interface EquipmentItem {
  id: number
  name: string
  category: EquipmentCategory
  trackedIndividually: boolean
  quantity: number | null
  lowStockThreshold: number | null
  units?: EquipmentUnit[]
  partner: { id: number; name: string } | null
}

export interface EquipmentUnit {
  id: number
  equipmentItemId: number
  status: EquipmentUnitStatus
  assignedTo: { playerName: string } | null
}

export interface EquipmentAssignment {
  id: number
  playerId: string
  equipmentItemId: number | null
  equipmentUnitId: number | null
  issuedAt: string
  returnedAt: string | null
  player: { playerName: string }
  equipmentItem: { name: string } | null
  equipmentUnit: { id: number } | null
}

export interface CreateEquipmentItemDto {
  name: string
  category: EquipmentCategory
  trackedIndividually: boolean
  quantity?: number
  lowStockThreshold?: number
}

export const CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  CLOTHING: 'Clothing',
  FOOTWEAR: 'Footwear',
  BALL_AND_TOOLS: 'Balls & Tools',
  REHABILITATION: 'Rehabilitation',
  TACTICAL: 'Tactical',
  OTHER: 'Other',
}

export const CATEGORY_STYLE: Record<EquipmentCategory, string> = {
  CLOTHING: 'bg-pink-100 text-pink-800 border-pink-200',
  FOOTWEAR: 'bg-orange-100 text-orange-800 border-orange-200',
  BALL_AND_TOOLS: 'bg-blue-100 text-blue-800 border-blue-200',
  REHABILITATION: 'bg-green-100 text-green-800 border-green-200',
  TACTICAL: 'bg-violet-100 text-violet-800 border-violet-200',
  OTHER: 'bg-gray-100 text-gray-600 border-gray-200',
}

export const UNIT_STATUS_LABEL: Record<EquipmentUnitStatus, string> = {
  AVAILABLE: 'Available',
  IN_USE: 'In Use',
  MAINTENANCE: 'In Maintenance',
  RETIRED: 'Retired',
}

export const UNIT_STATUS_STYLE: Record<EquipmentUnitStatus, string> = {
  AVAILABLE: 'bg-green-100 text-green-800 border-green-200',
  IN_USE: 'bg-blue-100 text-blue-800 border-blue-200',
  MAINTENANCE: 'bg-amber-100 text-amber-800 border-amber-200',
  RETIRED: 'bg-gray-100 text-gray-500 border-gray-200',
}

export type EquipmentLoanStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'ISSUED' | 'RETURNED'

export interface EquipmentLoan {
  id: number
  status: EquipmentLoanStatus
  requestedAt: string
  dueDate: string
  issuedAt: string | null
  returnedAt: string | null
  overdueNotifiedAt: string | null
  notes: string | null
  equipmentItemId: number
  equipmentUnitId: number | null
  requestedBy: { id: number; nickname: string }
  approvedBy: { id: number; nickname: string } | null
  equipmentItem: { id: number; name: string; category: EquipmentCategory }
  equipmentUnit: { id: number } | null
}

export function isLoanOverdue(loan: Pick<EquipmentLoan, 'status' | 'dueDate' | 'returnedAt'>, now: Date = new Date()): boolean {
  if (loan.status !== 'ISSUED' || loan.returnedAt) return false
  return new Date(loan.dueDate).getTime() < now.getTime()
}

export const LOAN_STATUS_LABEL: Record<EquipmentLoanStatus, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  ISSUED: 'Issued',
  RETURNED: 'Returned',
}

export const LOAN_STATUS_STYLE: Record<EquipmentLoanStatus, string> = {
  REQUESTED: 'bg-blue-100 text-blue-800 border-blue-200',
  APPROVED: 'bg-amber-100 text-amber-800 border-amber-200',
  REJECTED: 'bg-red-100 text-red-800 border-red-200',
  ISSUED: 'bg-purple-100 text-purple-800 border-purple-200',
  RETURNED: 'bg-green-100 text-green-800 border-green-200',
}
