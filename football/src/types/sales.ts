export type SalesType = 'TICKET' | 'UNIFORM' | 'OTHER' | 'VIP_TICKET' | 'COMPLIMENTARY'
export type SalesRecordStatus = 'COMPLETED' | 'CANCELLED' | 'REFUNDED'
export type SalesChannel = 'ONLINE' | 'ONSITE' | 'PARTNER' | 'SEASON_PASS'

export interface SalesRecord {
  id: number
  type: SalesType
  quantity: number
  unitPrice: number
  totalAmount: number
  currency: string
  saleDate: string
  description: string | null
  matchId: number | null
  seatZoneId: number | null
  status: SalesRecordStatus
  channel: SalesChannel | null
  createdById: string
  createdAt: string
  match: {
    id: number
    homeTeamName: string
    awayTeamName: string
    date: string
  } | null
}

export interface TicketMatchSummary {
  matchId: number
  date: string
  homeTeamName: string
  awayTeamName: string
  totalSold: number
  netSold: number
  cancelled: number
  refunded: number
  complimentary: number
  totalAmount: number
  capacity: number | null
  sellRate: number | null
  // backward compat
  totalQuantity: number
}

export interface CreateSalesRecordDto {
  type: SalesType
  quantity: number
  unitPrice: number
  currency?: string
  saleDate: string
  description?: string
  matchId?: number
  seatZoneId?: number
  status?: SalesRecordStatus
  channel?: SalesChannel
}
