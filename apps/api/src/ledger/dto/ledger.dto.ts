export interface CreateLedgerEntryDto {
  type: "INCOME" | "EXPENSE";
  category:
    | "SALARY" | "EQUIPMENT_PURCHASE" | "FACILITY_REPAIR" | "TRANSFER_FEE"
    | "TICKET_SALES" | "UNIFORM_SALES" | "SPONSORSHIP" | "ACADEMY_FEE"
    | "REFUND" | "OTHER";
  amount: number;
  currency?: "KRW" | "USD" | "EUR" | "GBP";
  exchangeRate?: number;
  amountKrw?: number;
  isRefund?: boolean;
  description?: string;
  relatedModule?: string;
  relatedId?: string;
}

export interface LedgerListQuery {
  type?: "INCOME" | "EXPENSE";
  category?: string;
  from?: string;
  to?: string;
}
