import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { api } from "../lib/api";
function fmtMoney(v) {
    return Number(v || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso) {
    if (!iso)
        return "—";
    return new Date(iso).toLocaleString("ru-RU", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
}
export function RevisionReportPage() {
    const params = useParams();
    const id = Number(params.id);
    const reportQuery = useQuery({
        queryKey: ["revision-report", id],
        enabled: Number.isFinite(id),
        queryFn: async () => (await api.get(`/revisions/${id}/report`)).data,
    });
    const data = reportQuery.data;
    const downloadExcel = async () => {
        const res = await api.get(`/revisions/${id}/export`, { responseType: "blob" });
        const blob = new Blob([res.data], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `revision_${id}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };
    return (_jsxs("main", { className: "mx-auto max-w-5xl p-3", children: [_jsxs("div", { className: "mb-4 flex items-center gap-2", children: [_jsx(Link, { to: "/revisions", className: "rounded p-1 text-slate-500 hover:bg-slate-100", title: "\u041D\u0430\u0437\u0430\u0434", children: _jsx(ArrowLeft, { size: 18 }) }), _jsx(FileText, { size: 20, className: "text-primary" }), _jsxs("div", { className: "flex-1", children: [_jsxs("h1", { className: "text-xl font-bold text-slate-800", children: ["\u041E\u0442\u0447\u0451\u0442 \u043F\u043E \u0440\u0435\u0432\u0438\u0437\u0438\u0438 #", id] }), data ? (_jsxs("p", { className: "text-xs text-slate-500", children: [data.status === "active" ? "Активна" : "Завершена", " \u00B7 \u0441\u043E\u0437\u0434\u0430\u043D\u0430 ", fmtDate(data.created_at), data.completed_at ? ` · завершена ${fmtDate(data.completed_at)}` : ""] })) : null] }), _jsxs("button", { type: "button", onClick: downloadExcel, disabled: !data || data.items.length === 0, className: "inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60", children: [_jsx(Download, { size: 16 }), " Excel"] })] }), reportQuery.isLoading ? (_jsx("p", { className: "text-sm text-slate-500", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" })) : !data ? (_jsx("p", { className: "text-sm text-red-600", children: "\u0420\u0435\u0432\u0438\u0437\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430" })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mb-4 grid gap-3 sm:grid-cols-3", children: [_jsxs("div", { className: "rounded-2xl bg-white p-4 shadow-sm", children: [_jsx("p", { className: "text-xs uppercase tracking-wide text-slate-500", children: "\u041F\u043E\u0434\u0441\u0447\u0438\u0442\u0430\u043D\u043E \u043F\u043E\u0437\u0438\u0446\u0438\u0439" }), _jsx("p", { className: "mt-1 text-2xl font-bold text-slate-800", children: data.summary.items_total }), _jsxs("p", { className: "text-xs text-slate-500", children: ["\u0441 \u0440\u0430\u0441\u0445\u043E\u0436\u0434\u0435\u043D\u0438\u044F\u043C\u0438: ", data.summary.items_with_diff] })] }), _jsxs("div", { className: "rounded-2xl bg-white p-4 shadow-sm", children: [_jsx("p", { className: "text-xs uppercase tracking-wide text-slate-500", children: "\u0418\u0437\u043B\u0438\u0448\u0435\u043A" }), _jsxs("p", { className: "mt-1 text-2xl font-bold text-blue-700", children: ["+", fmtMoney(data.summary.surplus_value), " \u0441\u043E\u043C"] })] }), _jsxs("div", { className: "rounded-2xl bg-white p-4 shadow-sm", children: [_jsx("p", { className: "text-xs uppercase tracking-wide text-slate-500", children: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0447\u0430" }), _jsxs("p", { className: "mt-1 text-2xl font-bold text-red-700", children: [fmtMoney(data.summary.shortage_value), " \u0441\u043E\u043C"] })] })] }), _jsx("div", { className: "overflow-hidden rounded-2xl bg-white shadow-sm", children: data.items.length === 0 ? (_jsx("p", { className: "p-6 text-center text-sm text-slate-500", children: "\u041F\u043E\u0437\u0438\u0446\u0438\u0439 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442." })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-2", children: "\u0422\u043E\u0432\u0430\u0440" }), _jsx("th", { className: "px-3 py-2", children: "\u0428\u0442\u0440\u0438\u0445\u043A\u043E\u0434" }), _jsx("th", { className: "px-3 py-2 text-right", children: "\u041E\u0436\u0438\u0434\u0430\u043B\u043E\u0441\u044C" }), _jsx("th", { className: "px-3 py-2 text-right", children: "\u0424\u0430\u043A\u0442" }), _jsx("th", { className: "px-3 py-2 text-right", children: "\u0394" }), _jsx("th", { className: "px-3 py-2 text-right", children: "\u0426\u0435\u043D\u0430 \u0437\u0430\u043A\u0443\u043F" }), _jsx("th", { className: "px-3 py-2 text-right", children: "\u0421\u0443\u043C\u043C\u0430 \u0394" })] }) }), _jsx("tbody", { children: data.items.map((it) => {
                                            const delta = Number(it.delta);
                                            const diff = Number(it.diff_value);
                                            return (_jsxs("tr", { className: "border-t hover:bg-slate-50", children: [_jsx("td", { className: "px-3 py-2", children: it.product_name }), _jsx("td", { className: "px-3 py-2 font-mono text-xs", children: it.barcode ?? "—" }), _jsx("td", { className: "px-3 py-2 text-right tabular-nums", children: it.expected_qty }), _jsx("td", { className: "px-3 py-2 text-right tabular-nums font-semibold", children: it.actual_qty }), _jsx("td", { className: `px-3 py-2 text-right tabular-nums font-semibold ${delta === 0
                                                            ? "text-slate-400"
                                                            : delta > 0
                                                                ? "text-blue-700"
                                                                : "text-red-700"}`, children: delta > 0 ? `+${it.delta}` : it.delta }), _jsx("td", { className: "px-3 py-2 text-right tabular-nums text-slate-600", children: fmtMoney(it.purchase_price) }), _jsxs("td", { className: `px-3 py-2 text-right tabular-nums font-semibold ${diff > 0 ? "text-blue-700" : diff < 0 ? "text-red-700" : "text-slate-400"}`, children: [diff > 0 ? "+" : "", fmtMoney(it.diff_value)] })] }, it.product_id));
                                        }) })] }) })) })] }))] }));
}
