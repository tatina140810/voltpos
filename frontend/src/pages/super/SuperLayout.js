import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { SuperPushButton } from "../../components/SuperPushButton";
import { useSuperAuthStore } from "../../store/superAuth";
const linkClass = ({ isActive }) => `block rounded-lg px-3 py-2 text-sm ${isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`;
export function SuperLayout() {
    const navigate = useNavigate();
    const { token, admin, logout } = useSuperAuthStore();
    // Manifest и apple-title подменяются в index.html inline-скриптом ДО загрузки React —
    // здесь больше ничего делать не надо.
    if (!token) {
        return _jsx(Navigate, { to: "/super/login", replace: true });
    }
    const onLogout = () => {
        logout();
        navigate("/super/login");
    };
    return (_jsxs("div", { className: "min-h-screen bg-slate-50", children: [_jsx("header", { className: "border-b bg-white", children: _jsxs("div", { className: "mx-auto flex max-w-6xl items-center justify-between px-4 py-3", children: [_jsxs("div", { className: "flex items-center gap-6", children: [_jsx("span", { className: "text-lg font-bold text-slate-900", children: "VoltPos \u00B7 \u041F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0430" }), _jsxs("nav", { className: "flex gap-2", children: [_jsx(NavLink, { to: "/super", end: true, className: linkClass, children: "\u041E\u0431\u0437\u043E\u0440" }), _jsx(NavLink, { to: "/super/orgs", className: linkClass, children: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D\u044B" })] })] }), _jsxs("div", { className: "flex items-center gap-3 text-sm text-slate-600", children: [_jsx(SuperPushButton, {}), _jsx("span", { children: admin?.name || admin?.email }), _jsx("button", { onClick: onLogout, className: "rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-100", children: "\u0412\u044B\u0439\u0442\u0438" })] })] }) }), _jsx("main", { className: "mx-auto max-w-6xl px-4 py-6", children: _jsx(Outlet, {}) })] }));
}
