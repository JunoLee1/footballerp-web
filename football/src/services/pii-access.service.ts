import { api } from './api'

export interface UserProfileDto {
  id: string
  username: string
  nickname: string
  role: string
  coachingRole: string | null
  frontOfficeRole: string | null
  team: { id: number; type: string } | null
  departments: Array<{ role: string; department: { id: number; name: string } }>
  email: string
  phone: string | null
  homeAddress: string | null
  masked: boolean
}

export interface PiiAccessRequestDto {
  id: number
  reason: string
  status: 'PENDING' | 'APPROVED' | 'DENIED'
  grantedUntil: string | null
  createdAt: string
  reviewedAt: string | null
  targetUser: { id: string; username: string; nickname: string }
  requester: { id: string; username: string; nickname: string }
  reviewedBy: { id: string; username: string; nickname: string } | null
}

export const piiAccessApi = {
  getUserProfile: (userId: string): Promise<UserProfileDto> =>
    api.get(`/admin/users/${userId}/profile`),

  request: (targetUserId: string, reason: string): Promise<PiiAccessRequestDto> =>
    api.post('/pii-access/requests', { targetUserId, reason }),

  listPending: (): Promise<PiiAccessRequestDto[]> =>
    api.get('/pii-access/requests'),

  myRequests: (): Promise<PiiAccessRequestDto[]> =>
    api.get('/pii-access/requests/mine'),

  approve: (id: number): Promise<PiiAccessRequestDto> =>
    api.patch(`/pii-access/requests/${id}/approve`, {}),

  deny: (id: number): Promise<PiiAccessRequestDto> =>
    api.patch(`/pii-access/requests/${id}/deny`, {}),
}
