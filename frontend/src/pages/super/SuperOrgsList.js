import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { superApi } from "../../lib/superApi";
const statusLabel = {
    active: { text: "Активен", classes: "bg-emerald-100 text-emerald-700" },
    blocked: { text: "Заблокирован", classes: "bg-rose-100 text-rose-700" },
    no_payment_set: { text: "Без подписки", classes: "bg-amber-100 text-amber-700" },
};
function formatPaidUntil(org) {
    if (!org.paid_until)
        return "—";
    const date = new Date(org.paid_until + "T00:00:00").toLocaleDateString("ru-RU");
    if (org.days_left == null)
        return date;
    if (org.days_left < 0)
        return `${date} (просрочка ${Math.abs(org.days_left)} дн)`;
    if (org.days_left <= 7)
        return `${date} (через ${org.days_left} дн)`;
    return date;
}
export function SuperOrgsList() {
    const { data, isLoading, isError } = useQuery({
        queryKey: ["super", "orgs"],
        queryFn: async () => (await superApi.get("/super/orgs")).data,
    });
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h1", { className: "text-2xl font-bold text-slate-900", children: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D\u044B" }), _jsx(Link, { to: "/super/orgs/new", className: "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white", children: "+ \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043C\u0430\u0433\u0430\u0437\u0438\u043D" })] }), isLoading ? _jsx("p", { className: "text-slate-500", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." }) : null, isError ? _jsx("p", { className: "text-rose-600", children: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0441\u043F\u0438\u0441\u043E\u043A." }) : null, data ? (_jsx("div", { className: "overflow-hidden rounded-2xl border bg-white shadow-sm", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "bg-slate-50 text-left text-slate-500", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3", children: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435" }), _jsx("th", { className: "px-4 py-3", children: "\u0422\u0438\u043F" }), _jsx("th", { className: "px-4 py-3", children: "\u041A\u043E\u0434" }), _jsx("th", { className: "px-4 py-3", children: "\u0421\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u0432" }), _jsx("th", { className: "px-4 py-3", children: "\u0426\u0435\u043D\u0430/\u043C\u0435\u0441" }), _jsx("th", { className: "px-4 py-3", children: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E \u0434\u043E" }), _jsx("th", { className: "px-4 py-3", children: "\u0421\u0442\u0430\u0442\u0443\u0441" }), _jsx("th", { className: "px-4 py-3" })] }) }), _jsxs("tbody", { children: [data.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 8, className: "px-4 py-8 text-center text-slate-400", children: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D\u043E\u0432 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u00AB+ \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u00BB." }) })) : null, data.map((org) => {
                                    const status = statusLabel[org.status];
                                    return (_jsxs("tr", { className: "border-t hover:bg-slate-50", children: [_jsx("td", { className: "px-4 py-3 font-medium text-slate-900", children: org.name }), _jsx("td", { className: "px-4 py-3 text-slate-600", children: org.category || "—" }), _jsx("td", { className: "px-4 py-3 font-mono text-xs text-slate-600", children: org.org_code }), _jsx("td", { className: "px-4 py-3 text-slate-700", children: org.employees_count }), _jsx("td", { className: "px-4 py-3 text-slate-700", children: org.monthly_fee != null ? `${org.monthly_fee.toLocaleString("ru-RU")} ₽` : "—" }), _jsx("td", { className: "px-4 py-3 text-slate-700", children: formatPaidUntil(org) }), _jsx("td", { className: "px-4 py-3", children: _jsx("span", { className: `rounded-full px-2 py-1 text-xs ${status.classes}`, children: status.text }) }), _jsx("td", { className: "px-4 py-3 text-right", children: _jsx(Link, { to: `/super/orgs/${org.id}`, className: "text-sm text-blue-600 hover:underline", children: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u2192" }) })] }, org.id));
                                })] })] }) })) : null] }));
}
