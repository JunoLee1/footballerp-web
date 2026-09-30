import { api } from "./api";

export interface Department {
  id: number;
  name: string;
  parentId: number | null;
  headId: string | null;
  parent: Pick<Department, 'id' | 'name'> | null;
  children: Pick<Department, 'id' | 'name' | 'isActive'>[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const departmentApi = {
  list: (): Promise<Department[]> => api.get("/departments"),
  get: (id: number): Promise<Department> => api.get(`/departments/${id}`),
  create: (data: { name: string; parentId?: number }): Promise<Department> =>
    api.post("/departments", data),
  update: (
    id: number,
    data: { name?: string; isActive?: boolean; parentId?: number | null }
  ): Promise<Department> => api.patch(`/departments/${id}`, data),
  delete: (id: number): Promise<void> => api.delete(`/departments/${id}`),
};

export type DeptRole = "DEPT_HEAD" | "LEADER" | "MEMBER" | "INTERN";

export interface Member {
  userId: string;
  departmentId: number;
  role: DeptRole;
  jobTitleId: number | null;
  jobTitle: { id: number; label: string } | null;
  joinedAt: string;
  user: { id: number; username: string; nickname: string; email: string; role: string };
  department: { id: number; name: string };
}

export interface DeptJobTitle {
  id: number;
  departmentId: number;
  label: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export const departmentMemberApi = {
  list: (deptId: number): Promise<Member[]> => api.get(`/departments/${deptId}/members`),
  add: (deptId: number, userId: string, role?: DeptRole, jobTitleId?: number | null): Promise<void> =>
    api.post(`/departments/${deptId}/members`, { userId, ...(role && { role }), ...(jobTitleId != null && { jobTitleId }) }),
  updateRole: (deptId: number, userId: string, role: DeptRole): Promise<void> =>
    api.patch(`/departments/${deptId}/members/${userId}`, { role }),
  remove: (deptId: number, userId: string): Promise<void> =>
    api.delete(`/departments/${deptId}/members/${userId}`),
  transfer: (deptId: number, userId: string, toDeptId: number, toRole?: DeptRole): Promise<void> =>
    api.post(`/departments/${deptId}/members/${userId}/transfer`, { toDeptId, ...(toRole && { toRole }) }),
  updateHead: (deptId: number, newHeadId: number | null): Promise<void> =>
    api.patch(`/departments/${deptId}/head`, { newHeadId }),
  updateJobTitle: (deptId: number, userId: string, jobTitleId: number | null): Promise<void> =>
    api.patch(`/departments/${deptId}/members/${userId}/job-title`, { jobTitleId }),
};

export const deptJobTitleApi = {
  list: (deptId: number): Promise<DeptJobTitle[]> =>
    api.get(`/departments/${deptId}/job-titles`),
  create: (deptId: number, data: { label: string; sortOrder?: number }): Promise<DeptJobTitle> =>
    api.post(`/departments/${deptId}/job-titles`, data),
  update: (deptId: number, titleId: number, data: { label?: string; sortOrder?: number }): Promise<DeptJobTitle> =>
    api.patch(`/departments/${deptId}/job-titles/${titleId}`, data),
  delete: (deptId: number, titleId: number): Promise<void> =>
    api.delete(`/departments/${deptId}/job-titles/${titleId}`),
};
