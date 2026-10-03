import { api } from './api'
import type { PlanReview } from '@/types/plan-report'

// DepartmentReviewerConfig — inline type to avoid referencing missing '@/types/department-plan' module
export interface DepartmentReviewerConfig {
  id: number
  subjectDepartmentId: number
  reviewerDepartmentId: number
  subjectDepartment: { id: number; name: string }
  reviewerDepartment: { id: number; name: string }
}

export const planReviewApi = {
  list: (planId: number) =>
    api.get<PlanReview[]>(`/plan-reviews/${planId}`),
  confirm: (planId: number, comment?: string) =>
    api.post<PlanReview>(`/plan-reviews/${planId}/confirm`, { comment }),
  // reject: reviewerDeptId is passed as a URL param per backend route
  // PATCH /plan-reviews/:planId/reviewer/:reviewerDeptId/reject
  reject: (planId: number, reviewerDeptId: number, reason: string) =>
    api.patch<PlanReview>(`/plan-reviews/${planId}/reviewer/${reviewerDeptId}/reject`, { reason }),
}

export const reviewerConfigApi = {
  list: (subjectDepartmentId: number) =>
    api.get<DepartmentReviewerConfig[]>(`/department-review-configs?subjectDepartmentId=${subjectDepartmentId}`),
  create: (data: { subjectDepartmentId: number; reviewerDepartmentId: number }) =>
    api.post<DepartmentReviewerConfig>(`/department-review-configs`, data),
  delete: (id: number) =>
    api.delete(`/department-review-configs/${id}`),
}
