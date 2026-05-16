import { create } from "zustand";
function parseRole(token) {
    if (!token)
        return "seller";
    try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        if (payload.role === "owner" || payload.role === "warehouse")
            return payload.role;
    }
    catch {
        // noop
    }
    return "seller";
}
// Последний успешно использованный org_code запоминаем в localStorage,
// чтобы кассир не вводил «свой» магазин при каждом логине.
// Дефолт пустой (а не TSF001) — тестовый код не должен прыгать к реальным магазинам.
const STORED_ORG_CODE_KEY = "voltpos_last_org_code";
export const useAuthStore = create((set) => ({
    token: localStorage.getItem("voltpos_token"),
    role: parseRole(localStorage.getItem("voltpos_token")),
    orgCode: localStorage.getItem(STORED_ORG_CODE_KEY) ?? "",
    pinCode: "",
    setOrgCode: (value) => {
        const next = value.toUpperCase();
        try {
            localStorage.setItem(STORED_ORG_CODE_KEY, next);
        }
        catch { /* приватный режим */ }
        set({ orgCode: next });
    },
    appendPin: (digit) => set((state) => ({
        pinCode: state.pinCode.length < 6 ? `${state.pinCode}${digit}` : state.pinCode,
    })),
    clearPin: () => set({ pinCode: "" }),
    backspacePin: () => set((state) => ({ pinCode: state.pinCode.slice(0, -1) })),
    setAuth: (token) => {
        if (token) {
            localStorage.setItem("voltpos_token", token);
        }
        else {
            localStorage.removeItem("voltpos_token");
        }
        set({ token, role: parseRole(token) });
    },
}));
