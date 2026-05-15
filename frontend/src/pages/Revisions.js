import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, FileText, Play } from "lucide-react";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";
function fmt(iso) {
    if (!iso)
        return "—";
    return new Date(iso).toLocaleString("ru-RU", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
}
export function RevisionsPage() {
    const role = useAuthStore((s) => s.role);
    const isOwner = role === "owner";
    const qc = useQueryClient();
    const navigate = useNavigate();
    const listQuery = useQuery({
        queryKey: ["revisions-list"],
        queryFn: async () => (await api.get("/revisions")).data,
    });
    const activeQuery = useQuery({
        queryKey: ["revisions-active"],
        queryFn: async () => (await api.get("/revisions/active")).data,
    });
    const createMutation = useMutation({
        mutationFn: async () => (await api.post("/revisions", { note: null })).data,
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: ["revisions-list"] });
            qc.invalidateQueries({ queryKey: ["revisions-active"] });
            navigate("/revisions/active");
        },
        onError: (err) => {
            const detail = err.response?.data?.detail;
            alert(detail ?? "Не удалось создать ревизию");
        },
    });
    const active = activeQuery.data?.revision ?? null;
    const items = listQuery.data ?? [];
    return (_jsxs("main", { className: "mx-auto max-w-4xl", children: [_jsxs("div", { className: "mb-4 flex items-center gap-2", children: [_jsx(ClipboardList, { size: 22, className: "text-primary" }), _jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-slate-800", children: "\u0420\u0435\u0432\u0438\u0437\u0438\u044F (\u0438\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u044F)" }), _jsx("p", { className: "text-sm text-slate-500", children: "\u0421\u0432\u0435\u0440\u043A\u0430 \u0444\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0445 \u043E\u0441\u0442\u0430\u0442\u043A\u043E\u0432 \u0441 \u0443\u0447\u0451\u0442\u043D\u044B\u043C\u0438. \u041D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043A\u043B\u0430\u0434\u043E\u0432\u0449\u0438\u043A\u043E\u0432 \u043C\u043E\u0433\u0443\u0442 \u0441\u0447\u0438\u0442\u0430\u0442\u044C \u043E\u0434\u043D\u043E\u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E." })] })] }), active ? (_jsx("div", { className: "mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4", children: _jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [_jsxs("div", { children: [_jsxs("p", { className: "text-sm font-semibold text-emerald-800", children: ["\u0410\u043A\u0442\u0438\u0432\u043D\u0430\u044F \u0440\u0435\u0432\u0438\u0437\u0438\u044F #", active.id] }), _jsxs("p", { className: "text-xs text-emerald-700", children: ["\u041E\u0442\u043A\u0440\u044B\u043B: ", active.created_by_name ?? "?", " \u00B7 ", fmt(active.created_at)] })] }), _jsxs(Link, { to: "/revisions/active", className: "inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700", children: [_jsx(Play, { size: 16 }), " \u0421\u0447\u0438\u0442\u0430\u0442\u044C \u0442\u043E\u0432\u0430\u0440\u044B"] })] }) })) : isOwner ? (_jsxs("div", { className: "mb-4 rounded-2xl border border-dashed border-indigo-300 bg-indigo-50 p-4 text-center", children: [_jsx("p", { className: "mb-2 text-sm text-slate-700", children: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E\u0439 \u0440\u0435\u0432\u0438\u0437\u0438\u0438 \u043D\u0435\u0442" }), _jsxs("button", { type: "button", onClick: () => createMutation.mutate(), disabled: createMutation.isPending, className: "inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60", children: [_jsx(Play, { size: 16 }), " ", createMutation.isPending ? "Создаю…" : "Начать новую ревизию"] })] })) : (_jsx("div", { className: "mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600", children: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E\u0439 \u0440\u0435\u0432\u0438\u0437\u0438\u0438 \u043D\u0435\u0442. \u041F\u043E\u043F\u0440\u043E\u0441\u0438 \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430 \u0435\u0451 \u043D\u0430\u0447\u0430\u0442\u044C." })), _jsxs("div", { className: "rounded-2xl bg-white shadow-sm", children: [_jsx("div", { className: "border-b px-4 py-3", children: _jsx("h2", { className: "text-base font-semibold text-slate-800", children: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0440\u0435\u0432\u0438\u0437\u0438\u0439" }) }), listQuery.isLoading ? (_jsx("p", { className: "p-4 text-sm text-slate-500", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" })) : items.length === 0 ? (_jsx("p", { className: "p-6 text-center text-sm text-slate-500", children: "\u0420\u0435\u0432\u0438\u0437\u0438\u0439 \u0435\u0449\u0451 \u043D\u0435 \u0431\u044B\u043B\u043E." })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-2", children: "\u2116" }), _jsx("th", { className: "px-3 py-2", children: "\u0421\u0442\u0430\u0442\u0443\u0441" }), _jsx("th", { className: "px-3 py-2", children: "\u041E\u0442\u043A\u0440\u044B\u043B" }), _jsx("th", { className: "px-3 py-2", children: "\u0421\u043E\u0437\u0434\u0430\u043D\u0430" }), _jsx("th", { className: "px-3 py-2", children: "\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u043B" }), _jsx("th", { className: "px-3 py-2", children: "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430" }), _jsx("th", { className: "px-3 py-2" })] }) }), _jsx("tbody", { children: items.map((r) => (_jsxs("tr", { className: "border-t hover:bg-slate-50", children: [_jsxs("td", { className: "px-3 py-2 font-mono", children: ["#", r.id] }), _jsx("td", { className: "px-3 py-2", children: _jsx("span", { className: `rounded-full px-2 py-0.5 text-xs ${r.status === "active"
                                                        ? "bg-emerald-100 text-emerald-700"
                                                        : "bg-slate-200 text-slate-700"}`, children: r.status === "active" ? "Активна" : "Завершена" }) }), _jsx("td", { className: "px-3 py-2", children: r.created_by_name ?? "?" }), _jsx("td", { className: "px-3 py-2 whitespace-nowrap", children: fmt(r.created_at) }), _jsx("td", { className: "px-3 py-2", children: r.completed_by_name ?? "—" }), _jsx("td", { className: "px-3 py-2 whitespace-nowrap", children: fmt(r.completed_at) }), _jsx("td", { className: "px-3 py-2", children: _jsxs(Link, { to: `/revisions/${r.id}/report`, className: "inline-flex items-center gap-1 text-xs text-primary hover:underline", children: [_jsx(FileText, { size: 14 }), " \u041E\u0442\u0447\u0451\u0442"] }) })] }, r.id))) })] }) }))] })] }));
}
