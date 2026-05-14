import { create } from "zustand";

import { SUPER_TOKEN_KEY } from "../lib/superApi";

export type SuperAdmin = {
  id: number;
  email: string;
  name: string;
};

type SuperAuthState = {
  token: string | null;
  admin: SuperAdmin | null;
  setAuth: (token: string | null, admin: SuperAdmin | null) => void;
  logout: () => void;
};

const ADMIN_CACHE_KEY = "voltpos_super_admin";

function readAdmin(): SuperAdmin | null {
  const raw = localStorage.getItem(ADMIN_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SuperAdmin;
  } catch {
    return null;
  }
}

export const useSuperAuthStore = create<SuperAuthState>((set) => ({
  token: localStorage.getItem(SUPER_TOKEN_KEY),
  admin: readAdmin(),
  setAuth: (token, admin) => {
    if (token) {
      localStorage.setItem(SUPER_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(SUPER_TOKEN_KEY);
    }
    if (admin) {
      localStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify(admin));
    } else {
      localStorage.removeItem(ADMIN_CACHE_KEY);
    }
    set({ token, admin });
  },
  logout: () => {
    localStorage.removeItem(SUPER_TOKEN_KEY);
    localStorage.removeItem(ADMIN_CACHE_KEY);
    set({ token: null, admin: null });
  },
}));
