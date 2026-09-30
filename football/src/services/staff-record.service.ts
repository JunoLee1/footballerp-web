import { api } from "./api";
import type { Department } from "./department.service";

export interface StaffRecord {
  id: number;
  name: string;
  role: string;
  departmentId: number | null;
  department: Department | null;
  phone: string | null;
  isActive: boolean;
  notes: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  // 신규 직원 팔로우업 (issue #375). Populated by HiringDispatch.dispatch().
  // `probationStartedAt` null == pre-#375 staff or manually-created records.
  probationStartedAt?: string | null;
  probationEndedAt?: string | null;
  probationStatus?: "IN_PROGRESS" | "PASSED" | "FAILED";
}

export const staffRecordApi = {
  list: (includeInactive = false): Promise<StaffRecord[]> =>
    api.get(`/staff-records?includeInactive=${includeInactive}`),
  get: (id: number): Promise<StaffRecord> => api.get(`/staff-records/${id}`),
  create: (
    data: Pick<StaffRecord, "name" | "role"> & Partial<Pick<StaffRecord, "departmentId" | "phone" | "notes">>
  ): Promise<StaffRecord> => api.post("/staff-records", data),
  update: (
    id: number,
    data: Partial<Pick<StaffRecord, "name" | "role" | "departmentId" | "phone" | "isActive" | "notes">>
  ): Promise<StaffRecord> => api.patch(`/staff-records/${id}`, data),
  delete: (id: number): Promise<void> => api.delete(`/staff-records/${id}`),
};
