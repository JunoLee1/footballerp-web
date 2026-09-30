import { api } from './api'
import type { UserDto } from '@/types/auth'

export const authApi = {
  login: async (email: string, password: string): Promise<void> => {
    await api.post('/auth/login', { email, password })
    const me = await api.get<UserDto>('/auth/me')
    localStorage.setItem('userRole', me.role)
    localStorage.setItem('loggedIn', '1')
  },

  me: (): Promise<UserDto> => api.get<UserDto>('/auth/me'),

  updateLanguage: (language: 'ko' | 'en'): Promise<{ ok: boolean }> =>
    api.patch('/auth/me/language', { language }),

  updateProfile: (data: { email?: string; homeAddress?: string | null; phoneNumber?: string }): Promise<{ id: number; email: string; username: string; homeAddress: string | null }> =>
    api.patch('/auth/me/profile', data),

  updatePassword: (data: { currentPassword: string; newPassword: string; confirmedPassword: string }): Promise<{ ok: boolean }> =>
    api.patch('/auth/me/password', data),

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // ignore
    } finally {
      localStorage.removeItem('loggedIn')
      localStorage.removeItem('userRole')
      localStorage.removeItem('superAdminTeamId')
    }
  },

  getLoginHistory: (userId?: string) =>
    api.get<LoginHistoryEntry[]>(userId ? `/auth/login-history/${userId}` : '/auth/login-history'),
}

export interface LoginHistoryEntry {
  id: number
  email: string
  ip: string
  userAgent: string
  success: boolean
  createdAt: string
  user?: { id: number; nickname: string } | null
}
