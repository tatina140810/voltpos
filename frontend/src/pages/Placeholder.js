import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function PlaceholderPage({ title, hint }) {
    return (_jsxs("main", { children: [_jsx("h1", { className: "mb-3 text-3xl font-semibold", children: title }), _jsx("div", { className: "rounded-2xl bg-white p-6 shadow", children: _jsx("p", { className: "text-slate-600", children: hint ?? "Раздел в работе" }) })] }));
}
