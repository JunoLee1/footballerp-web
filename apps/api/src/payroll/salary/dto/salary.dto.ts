import type { PayrollCountry } from "../../../generated/enums";

export interface CreateSalaryDto {
  userId?: string;
  staffRecordId?: string;
  baseSalary: number;
  country: PayrollCountry;
  effectiveFrom: string;
}

export interface UpdateSalaryDto {
  baseSalary?: number;
  country?: PayrollCountry;
  effectiveFrom?: string;
}

export interface SalaryListQuery {
  country?: PayrollCountry;
}
