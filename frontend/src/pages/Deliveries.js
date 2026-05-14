import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
function isoDate(d) {
    return d.toISOString().slice(0, 10);
}
function fmtMoney(v) {
    const n = Number(v) || 0;
    return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDateTime(iso) {
    if (!iso)
        return "—";
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}
function fmtDate(iso) {
    if (!iso)
        return "—";
    return new Date(iso).toLocaleDateString("ru-RU");
}
const STATUS_LABEL = {
    completed: "Оплачено",
    debt: "Долг",
    installment: "Рассрочка",
    returned: "Возврат",
};
export function DeliveriesPage() {
    const today = isoDate(new Date());
    const monthAgo = isoDate(new Date(Date.now() - 30 * 24 * 3600 * 1000));
    const [from, setFrom] = useState(monthAgo);
    const [to, setTo] = useState(today);
    const deliveriesQuery = useQuery({
        queryKey: ["deliveries", from, to],
        queryFn: async () => (await api.get("/deliveries", { params: { from, to } })).data,
    });
    const items = useMemo(() => deliveriesQuery.data?.items ?? [], [deliveriesQuery.data]);
    const summary = deliveriesQuery.data?.summary;
    return (_jsxs("main", { children: [_jsx("h1", { className: "mb-4 text-2xl font-semibold", children: "\u0414\u043E\u0441\u0442\u0430\u0432\u043A\u0438" }), _jsxs("div", { className: "mb-4 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm", children: [_jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0421" }), _jsx("input", { type: "date", value: from, onChange: (e) => setFrom(e.target.value), className: "rounded-lg border border-slate-300 px-3 py-1.5 text-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u041F\u043E" }), _jsx("input", { type: "date", value: to, onChange: (e) => setTo(e.target.value), className: "rounded-lg border border-slate-300 px-3 py-1.5 text-sm" })] }), _jsx("div", { className: "flex flex-1 flex-wrap items-center justify-end gap-2 text-sm", children: [
                            { label: "Сегодня", from: today, to: today },
                            { label: "Неделя", from: isoDate(new Date(Date.now() - 7 * 24 * 3600 * 1000)), to: today },
                            { label: "Месяц", from: monthAgo, to: today },
                        ].map((p) => (_jsx("button", { type: "button", onClick: () => { setFrom(p.from); setTo(p.to); }, className: "rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-primary hover:text-primary", children: p.label }, p.label))) })] }), summary ? (_jsxs("div", { className: "mb-4 grid gap-3 sm:grid-cols-3", children: [_jsxs("div", { className: "rounded-2xl bg-white p-4 shadow-sm", children: [_jsx("p", { className: "text-xs uppercase tracking-wide text-slate-500", children: "\u0414\u043E\u0441\u0442\u0430\u0432\u043E\u043A" }), _jsx("p", { className: "mt-1 text-2xl font-bold text-slate-800", children: summary.count })] }), _jsxs("div", { className: "rounded-2xl bg-white p-4 shadow-sm", children: [_jsx("p", { className: "text-xs uppercase tracking-wide text-slate-500", children: "\u0421\u0443\u043C\u043C\u0430 \u043F\u0440\u043E\u0434\u0430\u0436" }), _jsxs("p", { className: "mt-1 text-2xl font-bold text-slate-800", children: [fmtMoney(summary.sum_sales), " \u0441\u043E\u043C"] })] }), _jsxs("div", { className: "rounded-2xl bg-white p-4 shadow-sm", children: [_jsx("p", { className: "text-xs uppercase tracking-wide text-slate-500", children: "\u0418\u0437 \u043D\u0438\u0445 \u0437\u0430 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0443" }), _jsxs("p", { className: "mt-1 text-2xl font-bold text-slate-800", children: [fmtMoney(summary.sum_delivery_fee), " \u0441\u043E\u043C"] })] })] })) : null, _jsx("div", { className: "overflow-hidden rounded-2xl bg-white shadow-sm", children: deliveriesQuery.isLoading ? (_jsx("p", { className: "p-4 text-sm text-slate-500", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" })) : items.length === 0 ? (_jsx("p", { className: "p-6 text-center text-sm text-slate-500", children: "\u0417\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043F\u0435\u0440\u0438\u043E\u0434 \u0434\u043E\u0441\u0442\u0430\u0432\u043E\u043A \u043D\u0435 \u0431\u044B\u043B\u043E." })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-2", children: "\u0421\u043E\u0437\u0434\u0430\u043D\u043E" }), _jsx("th", { className: "px-3 py-2", children: "\u0414\u0430\u0442\u0430 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438" }), _jsx("th", { className: "px-3 py-2", children: "\u041A\u043B\u0438\u0435\u043D\u0442" }), _jsx("th", { className: "px-3 py-2", children: "\u0410\u0434\u0440\u0435\u0441" }), _jsx("th", { className: "px-3 py-2 text-right", children: "\u0421\u0443\u043C\u043C\u0430 \u043F\u0440\u043E\u0434\u0430\u0436\u0438" }), _jsx("th", { className: "px-3 py-2 text-right", children: "\u0426\u0435\u043D\u0430 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438" }), _jsx("th", { className: "px-3 py-2 text-right", children: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E" }), _jsx("th", { className: "px-3 py-2", children: "\u0421\u0442\u0430\u0442\u0443\u0441" })] }) }), _jsx("tbody", { children: items.map((d) => (_jsxs("tr", { className: "border-t hover:bg-slate-50", children: [_jsx("td", { className: "whitespace-nowrap px-3 py-2 text-slate-600", children: fmtDateTime(d.created_at) }), _jsx("td", { className: "whitespace-nowrap px-3 py-2 text-slate-700", children: fmtDate(d.delivery_date) }), _jsx("td", { className: "px-3 py-2", children: d.customer_name ?? _jsx("span", { className: "text-slate-400", children: "\u0431\u0435\u0437 \u043A\u043B\u0438\u0435\u043D\u0442\u0430" }) }), _jsx("td", { className: "px-3 py-2 text-slate-600", children: d.delivery_address ?? _jsx("span", { className: "text-slate-400", children: "\u2014" }) }), _jsx("td", { className: "whitespace-nowrap px-3 py-2 text-right tabular-nums font-semibold", children: fmtMoney(d.sale_total) }), _jsx("td", { className: "whitespace-nowrap px-3 py-2 text-right tabular-nums", children: d.delivery_type === "included" ? (_jsx("span", { className: "text-xs text-slate-500", children: "\u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0430" })) : (fmtMoney(d.delivery_price)) }), _jsx("td", { className: "whitespace-nowrap px-3 py-2 text-right tabular-nums", children: fmtMoney(d.paid_total) }), _jsx("td", { className: "px-3 py-2", children: _jsx("span", { className: `rounded-full px-2 py-0.5 text-xs ${d.status === "debt"
                                                    ? "bg-amber-50 text-amber-700"
                                                    : d.status === "returned"
                                                        ? "bg-red-50 text-red-700"
                                                        : d.status === "installment"
                                                            ? "bg-blue-50 text-blue-700"
                                                            : "bg-emerald-50 text-emerald-700"}`, children: STATUS_LABEL[d.status] ?? d.status }) })] }, d.id))) })] }) })) })] }));
}
