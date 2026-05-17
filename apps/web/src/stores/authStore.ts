import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserPublic } from '@/lib/types'

interface AuthState {
  user: UserPublic | null
  accessToken: string | null
  refreshToken: string | null

  setSession: (user: UserPublic, accessToken: string, refreshToken: string) => void
  setTokens: (accessToken: string, refreshToken: string) => void
  setUser: (user: UserPublic) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setSession: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken }),
      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),
      setUser: (user) => set({ user }),
      logout: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    { name: 'smart-kanban-auth' },
  ),
)
