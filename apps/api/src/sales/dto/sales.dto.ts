export interface CreateSalesRecordDto {
  type: "TICKET" | "UNIFORM" | "OTHER" | "VIP_TICKET" | "COMPLIMENTARY";
  quantity: number;
  unitPrice: number;
  currency?: "KRW" | "USD" | "EUR" | "GBP";
  saleDate: string;
  description?: string;
  matchId?: string;
  seatZoneId?: number;
  status?: "COMPLETED" | "CANCELLED" | "REFUNDED";
  channel?: "ONLINE" | "ONSITE" | "PARTNER" | "SEASON_PASS";
}
