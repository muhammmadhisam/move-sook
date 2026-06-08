import { create } from 'zustand';
import type { MeResponse, Role } from '@movesook/shared';

interface AuthState {
  me: MeResponse | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  setMe: (me: MeResponse | null) => void;
  setStatus: (status: AuthState['status']) => void;
  hasRole: (...roles: Role[]) => boolean;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  me: null,
  status: 'idle',
  setMe: (me) => set({ me, status: me ? 'authenticated' : 'unauthenticated' }),
  setStatus: (status) => set({ status }),
  hasRole: (...roles) => {
    const role = get().me?.role;
    return role ? roles.includes(role) : false;
  },
  reset: () => set({ me: null, status: 'unauthenticated' }),
}));
