import { create } from 'zustand';
import type { FamilySummary, User } from '../types';

interface AuthState {
  token: string | null;
  user: User | null;
  families: FamilySummary[];
  activeFamily: FamilySummary | null;
  setAuth: (token: string, user: User) => void;
  setFamilies: (families: FamilySummary[]) => void;
  setActiveFamily: (family: FamilySummary) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem('fet_token'),
  user: JSON.parse(localStorage.getItem('fet_user') || 'null'),
  families: [],
  activeFamily: null,
  setAuth: (token, user) => {
    localStorage.setItem('fet_token', token);
    localStorage.setItem('fet_user', JSON.stringify(user));
    set({ token, user });
  },
  setFamilies: (families) =>
    set((s) => ({
      families,
      activeFamily:
        s.activeFamily ?? families.find((f) => f.role !== 'VIEWER') ?? families[0] ?? null,
    })),
  setActiveFamily: (family) => set({ activeFamily: family }),
  logout: () => {
    localStorage.removeItem('fet_token');
    localStorage.removeItem('fet_user');
    set({ token: null, user: null, families: [], activeFamily: null });
  },
}));

export const fmtMoney = (v: number | string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(v));
