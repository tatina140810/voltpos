import { create } from "zustand";

type AuthState = {
  token: string | null;
  role: "owner" | "seller" | "warehouse";
  orgCode: string;
  pinCode: string;
  setOrgCode: (value: string) => void;
  appendPin: (digit: string) => void;
  clearPin: () => void;
  backspacePin: () => void;
  setAuth: (token: string | null) => void;
};

function parseRole(token: string | null): "owner" | "seller" | "warehouse" {
  if (!token) return "seller";
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.role === "owner" || payload.role === "warehouse") return payload.role;
  } catch {
    // noop
  }
  return "seller";
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem("voltpos_token"),
  role: parseRole(localStorage.getItem("voltpos_token")),
  orgCode: "TSF001",
  pinCode: "",
  setOrgCode: (value) => set({ orgCode: value.toUpperCase() }),
  appendPin: (digit) =>
    set((state) => ({
      pinCode: state.pinCode.length < 6 ? `${state.pinCode}${digit}` : state.pinCode,
    })),
  clearPin: () => set({ pinCode: "" }),
  backspacePin: () => set((state) => ({ pinCode: state.pinCode.slice(0, -1) })),
  setAuth: (token) => {
    if (token) {
      localStorage.setItem("voltpos_token", token);
    } else {
      localStorage.removeItem("voltpos_token");
    }
    set({ token, role: parseRole(token) });
  },
}));
