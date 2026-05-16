import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";
const keypad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];
export function LoginPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { orgCode, pinCode, setOrgCode, appendPin, clearPin, backspacePin, setAuth } = useAuthStore();
    const [error, setError] = useState("");
    const loginMutation = useMutation({
        mutationFn: async () => {
            const response = await api.post("/auth/org-login", { org_code: orgCode, pin_code: pinCode });
            return response.data;
        },
        onSuccess: (data) => {
            setAuth(data.access_token);
            // Сбрасываем все кеши: настройки магазина (org-me), товары, остатки и т.д.
            // Без этого после смены пользователя/магазина старые данные ещё 5 минут
            // показываются (staleTime), и hasDelivery/hasInstallment врут.
            queryClient.clear();
            navigate("/sale");
        },
        onError: () => setError("Неверный org code или PIN"),
    });
    const onKeyPress = (key) => {
        if (key === "clear")
            return clearPin();
        if (key === "back")
            return backspacePin();
        appendPin(key);
    };
    return (_jsx("main", { className: "mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-6", children: _jsxs("section", { className: "w-full rounded-2xl bg-white p-6 shadow-lg", children: [_jsx("img", { src: "/logo.png", alt: "VoltPos", style: { height: "140px", objectFit: "contain", marginBottom: "8px", display: "block", marginLeft: "auto", marginRight: "auto" } }), (() => {
                    const cached = typeof window !== "undefined" ? localStorage.getItem("voltpos_last_org_name") : null;
                    return cached ? (_jsx("p", { className: "text-center text-base font-semibold text-slate-800", children: cached })) : null;
                })(), _jsx("p", { className: "text-sm text-slate-500", children: "\u0412\u0445\u043E\u0434 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0430" }), _jsxs("div", { className: "mt-6 space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-sm text-slate-600", children: "Org code" }), _jsx("input", { className: "w-full rounded-xl border p-3 text-lg uppercase", value: orgCode, onChange: (e) => setOrgCode(e.target.value), placeholder: "\u041A\u043E\u0434 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0430 (6 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432)" })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-sm text-slate-600", children: "PIN \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0430" }), _jsx("div", { className: "rounded-xl bg-slate-100 p-4 text-center text-2xl tracking-[0.4em]", children: (pinCode || "").padEnd(4, "•") })] })] }), _jsx("div", { className: "mt-4 grid grid-cols-3 gap-2", children: keypad.map((key) => (_jsx("button", { className: "rounded-xl border bg-white p-4 text-xl font-semibold active:scale-[0.98]", onClick: () => onKeyPress(key), children: key === "clear" ? "C" : key === "back" ? "⌫" : key }, key))) }), error ? _jsx("p", { className: "mt-3 text-sm text-danger", children: error }) : null, _jsx("button", { disabled: pinCode.length < 4 || loginMutation.isPending, onClick: () => loginMutation.mutate(), className: "mt-5 w-full rounded-xl bg-primary p-4 text-lg font-semibold text-white disabled:opacity-50", children: loginMutation.isPending ? "Вход..." : "Войти в кассу" })] }) }));
}
