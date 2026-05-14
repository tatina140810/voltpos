import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { superApi } from "../../lib/superApi";
import { useSuperAuthStore } from "../../store/superAuth";
export function SuperLoginPage() {
    const navigate = useNavigate();
    const setAuth = useSuperAuthStore((s) => s.setAuth);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const loginMutation = useMutation({
        mutationFn: async () => {
            const response = await superApi.post("/super/auth/login", { email, password });
            return response.data;
        },
        onSuccess: (data) => {
            setAuth(data.access_token, data.admin);
            navigate("/super");
        },
        onError: () => setError("Неверный email или пароль"),
    });
    const onSubmit = (event) => {
        event.preventDefault();
        setError("");
        loginMutation.mutate();
    };
    return (_jsx("main", { className: "mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-6", children: _jsxs("section", { className: "w-full rounded-2xl bg-white p-6 shadow-lg", children: [_jsx("h1", { className: "text-2xl font-bold text-slate-800", children: "VoltPos \u00B7 \u041F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0430" }), _jsx("p", { className: "mt-1 text-sm text-slate-500", children: "\u041F\u0430\u043D\u0435\u043B\u044C \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430 \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u044B" }), _jsxs("form", { className: "mt-6 space-y-4", onSubmit: onSubmit, children: [_jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-sm text-slate-600", children: "Email" }), _jsx("input", { type: "email", className: "w-full rounded-xl border p-3 text-base", value: email, onChange: (e) => setEmail(e.target.value), autoComplete: "username", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-sm text-slate-600", children: "\u041F\u0430\u0440\u043E\u043B\u044C" }), _jsx("input", { type: "password", className: "w-full rounded-xl border p-3 text-base", value: password, onChange: (e) => setPassword(e.target.value), autoComplete: "current-password", required: true })] }), error ? _jsx("p", { className: "text-sm text-rose-600", children: error }) : null, _jsx("button", { type: "submit", disabled: loginMutation.isPending, className: "w-full rounded-xl bg-slate-900 p-4 text-lg font-semibold text-white disabled:opacity-50", children: loginMutation.isPending ? "Вход..." : "Войти" })] })] }) }));
}
