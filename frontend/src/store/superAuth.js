import { create } from "zustand";
import { SUPER_TOKEN_KEY } from "../lib/superApi";
const ADMIN_CACHE_KEY = "voltpos_super_admin";
function readAdmin() {
    const raw = localStorage.getItem(ADMIN_CACHE_KEY);
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
export const useSuperAuthStore = create((set) => ({
    token: localStorage.getItem(SUPER_TOKEN_KEY),
    admin: readAdmin(),
    setAuth: (token, admin) => {
        if (token) {
            localStorage.setItem(SUPER_TOKEN_KEY, token);
        }
        else {
            localStorage.removeItem(SUPER_TOKEN_KEY);
        }
        if (admin) {
            localStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify(admin));
        }
        else {
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
