import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NotificationsCard } from "../components/NotificationsCard";
import { useBusinessSettings } from "../hooks/useBusinessSettings";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";
/** Возвращает локальную дату YYYY-MM-DD без сдвига в UTC.
 *  toISOString() возвращает UTC-дату, что в +6 (Бишкек) может «сдвинуть» сегодня
 *  на вчера утром после полуночи и наоборот. */
function isoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}
function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}
function startOfMonth() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
}
const WRITEOFF_LABEL = {
    expired: "⏰ Просрочка",
    damaged: "💥 Порча / бой",
    theft: "🚫 Кража",
    own_use: "🏠 Внутр. использование",
    return_to_supplier: "↩️ Возврат поставщику",
    other: "📦 Другое",
};
function resolveRange(preset, customFrom, customTo) {
    const now = new Date();
    if (preset === "today") {
        const day = isoDate(startOfToday());
        return { from: day, to: day };
    }
    if (preset === "week") {
        const from = new Date();
        from.setDate(now.getDate() - 6);
        return { from: isoDate(from), to: isoDate(now) };
    }
    if (preset === "month") {
        return { from: isoDate(startOfMonth()), to: isoDate(now) };
    }
    return { from: customFrom, to: customTo };
}
function detectPaymentMethod(sale) {
    const cash = Number(sale.paid_cash);
    const card = Number(sale.paid_card);
    const transfer = Number(sale.paid_transfer);
    const nonzero = [cash > 0 ? "Наличные" : null, card > 0 ? "Карта" : null, transfer > 0 ? "Перевод" : null].filter(Boolean);
    if (nonzero.length === 0)
        return "—";
    if (nonzero.length === 1)
        return nonzero[0];
    return "Смешанная";
}
const STATUS_LABEL = {
    completed: "Оплачено",
    debt: "Долг",
    returned: "Возврат",
};
export function ReportsPage() {
    const role = useAuthStore((s) => s.role);
    const { hasDelivery } = useBusinessSettings();
    const [preset, setPreset] = useState("today");
    const [customFrom, setCustomFrom] = useState(isoDate(new Date()));
    const [customTo, setCustomTo] = useState(isoDate(new Date()));
    const [reportPin, setReportPin] = useState("");
    const [pinInput, setPinInput] = useState("");
    const [showPinModal, setShowPinModal] = useState(true);
    const [pinError, setPinError] = useState("");
    const [page, setPage] = useState(1);
    const [salaryInput, setSalaryInput] = useState("");
    const [otherExpensesList, setOtherExpensesList] = useState([
        { amount: "", comment: "" },
    ]);
    const queryClient = useQueryClient();
    if (role !== "owner") {
        return _jsx(Navigate, { to: "/sale", replace: true });
    }
    const range = resolveRange(preset, customFrom, customTo);
    const summaryQuery = useQuery({
        queryKey: ["reports-summary", range.from, range.to, reportPin],
        enabled: !!reportPin,
        queryFn: async () => {
            try {
                const response = await api.get("/reports/summary", {
                    params: { from: range.from, to: range.to },
                    headers: { "X-Report-Pin": reportPin },
                });
                return response.data;
            }
            catch (err) {
                const status = err.response?.status;
                if (status === 403) {
                    setPinError("Неверный PIN");
                    setShowPinModal(true);
                    setReportPin("");
                }
                throw err;
            }
        },
    });
    const periodExpensesQuery = useQuery({
        queryKey: ["period-expenses", range.from, range.to, reportPin],
        enabled: !!reportPin,
        queryFn: async () => {
            const response = await api.get("/period-expenses", {
                params: { from: range.from, to: range.to },
                headers: { "X-Report-Pin": reportPin },
            });
            return response.data;
        },
    });
    const expensesEditable = periodExpensesQuery.data?.editable ?? (range.from === range.to);
    // При смене периода — подтянуть сохранённые поля.
    useEffect(() => {
        const data = periodExpensesQuery.data;
        if (!data)
            return;
        const salaryNum = Number(data.salary);
        setSalaryInput(salaryNum > 0 ? String(salaryNum) : "");
        if (data.other_expenses && data.other_expenses.length > 0) {
            setOtherExpensesList(data.other_expenses.map((r) => ({ amount: r.amount || "", comment: r.comment || "" })));
        }
        else {
            setOtherExpensesList([{ amount: "", comment: "" }]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [periodExpensesQuery.data, range.from, range.to]);
    const saveExpensesMutation = useMutation({
        mutationFn: async () => {
            const payload = {
                salary: Number(salaryInput) || 0,
                other_expenses: otherExpensesList
                    .filter((r) => r.amount || r.comment)
                    .map((r) => ({ amount: r.amount || "", comment: r.comment || "" })),
            };
            const response = await api.put("/period-expenses", payload, {
                params: { from: range.from, to: range.to },
                headers: { "X-Report-Pin": reportPin },
            });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["period-expenses", range.from, range.to, reportPin] });
        },
    });
    const debtPaymentsQuery = useQuery({
        queryKey: ["reports-debt-payments", range.from, range.to, reportPin],
        enabled: !!reportPin,
        queryFn: async () => {
            const response = await api.get("/reports/debt-payments", {
                params: { date_from: range.from, date_to: range.to },
                headers: { "X-Report-Pin": reportPin },
            });
            return response.data;
        },
    });
    const writeoffsQuery = useQuery({
        queryKey: ["reports-writeoffs", range.from, range.to, reportPin],
        enabled: !!reportPin,
        queryFn: async () => {
            const response = await api.get("/reports/writeoffs", {
                params: { from: range.from, to: range.to },
                headers: { "X-Report-Pin": reportPin },
            });
            return response.data;
        },
    });
    const data = summaryQuery.data;
    const sales = data?.sales_list ?? [];
    const pageSize = 20;
    const totalPages = Math.max(1, Math.ceil(sales.length / pageSize));
    const pagedSales = sales.slice((page - 1) * pageSize, page * pageSize);
    // Текст «X продаж не было» зависит от выбранного периода.
    const emptyMessage = preset === "today"
        ? "Сегодня продаж не было"
        : preset === "week"
            ? "За последние 7 дней продаж не было"
            : preset === "month"
                ? "За месяц продаж не было"
                : "За выбранный период продаж не было";
    return (_jsxs("main", { children: [_jsx("h1", { className: "mb-4 text-3xl font-semibold", children: "\u041E\u0442\u0447\u0451\u0442\u044B" }), _jsx("section", { className: "mb-4", children: _jsx(NotificationsCard, {}) }), _jsx("section", { className: "mb-4 rounded-2xl bg-white p-4 shadow", children: _jsxs("div", { className: "flex flex-wrap items-end gap-2", children: [_jsxs("select", { className: "rounded-xl border p-3", value: preset, onChange: (e) => {
                                setPreset(e.target.value);
                                setPage(1);
                            }, children: [_jsx("option", { value: "today", children: "\u0421\u0435\u0433\u043E\u0434\u043D\u044F" }), _jsx("option", { value: "week", children: "7 \u0434\u043D\u0435\u0439" }), _jsx("option", { value: "month", children: "\u041C\u0435\u0441\u044F\u0446" }), _jsx("option", { value: "custom", children: "\u0421\u0432\u043E\u0439 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D" })] }), preset === "custom" ? (_jsxs(_Fragment, { children: [_jsx("input", { type: "date", className: "rounded-xl border p-3", value: customFrom, onChange: (e) => setCustomFrom(e.target.value) }), _jsx("input", { type: "date", className: "rounded-xl border p-3", value: customTo, onChange: (e) => setCustomTo(e.target.value) })] })) : null, _jsxs("span", { className: "ml-auto text-sm text-slate-500", children: ["\u041F\u0435\u0440\u0438\u043E\u0434: ", range.from, " \u2014 ", range.to] })] }) }), summaryQuery.isLoading ? _jsx("p", { className: "text-slate-500", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043E\u0442\u0447\u0451\u0442\u0430..." }) : null, summaryQuery.isError && !showPinModal ? (_jsx("p", { className: "text-red-600", children: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043E\u0442\u0447\u0451\u0442" })) : null, data && data.sales.count === 0 && data.cash_withdrawals.count === 0
                && !(debtPaymentsQuery.data && debtPaymentsQuery.data.count > 0) ? (_jsxs("section", { className: "rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm", children: [_jsx("p", { className: "text-2xl font-semibold text-slate-700", children: emptyMessage }), _jsx("p", { className: "mt-2 text-sm text-slate-500", children: "\u0422\u0430\u043A\u0436\u0435 \u043D\u0435\u0442 \u0438\u043D\u043A\u0430\u0441\u0441\u0430\u0446\u0438\u0438 \u0437\u0430 \u044D\u0442\u043E\u0442 \u043F\u0435\u0440\u0438\u043E\u0434. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u0434\u0440\u0443\u0433\u043E\u0439 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D." }), _jsxs("div", { className: "mt-4 inline-block rounded-lg bg-slate-50 px-4 py-2 font-mono text-sm text-slate-600", children: ["\u041F\u0435\u0440\u0438\u043E\u0434: ", range.from, " \u2014 ", range.to] }), data.debt.outstanding_total && Number(data.debt.outstanding_total) > 0 ? (_jsxs("p", { className: "mt-4 text-sm text-red-600", children: ["\u041E\u0431\u0449\u0430\u044F \u0442\u0435\u043A\u0443\u0449\u0430\u044F \u0437\u0430\u0434\u043E\u043B\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u044C \u043F\u043E \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0443: ", _jsxs("b", { children: [num(data.debt.outstanding_total), " \u0441\u043E\u043C"] })] })) : null] })) : null, data && (data.sales.count > 0
                || data.cash_withdrawals.count > 0
                || (debtPaymentsQuery.data && debtPaymentsQuery.data.count > 0)) ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "mb-4 rounded-2xl bg-white p-4 shadow", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between", children: [_jsx("h2", { className: "text-lg font-semibold", children: "\uD83D\uDCB5 \u0418\u043D\u043A\u0430\u0441\u0441\u0430\u0446\u0438\u044F \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434" }), _jsxs("span", { className: "text-lg font-bold text-red-600", children: ["\u2212", num(data.cash_withdrawals.total), " \u0441\u043E\u043C"] })] }), data.cash_withdrawals.items.length === 0 ? (_jsx("p", { className: "text-sm text-slate-500", children: "\u0417\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043F\u0435\u0440\u0438\u043E\u0434 \u0432\u044B\u0434\u0430\u0447 \u043D\u0435 \u0431\u044B\u043B\u043E" })) : (_jsx("div", { className: "space-y-2", children: data.cash_withdrawals.items.map((w) => (_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm", children: [_jsxs("div", { children: [_jsx("p", { className: "font-semibold", children: w.recipient }), w.reason ? _jsx("p", { className: "text-slate-600", children: w.reason }) : null, _jsxs("p", { className: "text-xs text-slate-500", children: [w.created_at ? new Date(w.created_at).toLocaleString() : "—", " \u00B7 ", w.issued_by_name ?? "—"] })] }), _jsxs("p", { className: "text-lg font-bold text-red-600", children: ["\u2212", num(w.amount), " \u0441\u043E\u043C"] })] }, w.id))) }))] }), _jsxs("section", { className: "mb-4 rounded-2xl bg-white p-4 shadow", children: [_jsx("h2", { className: "mb-3 text-lg font-semibold", children: "\u041E\u0442\u0447\u0451\u0442 \u043F\u043E \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u0430\u043C" }), data.by_seller.length === 0 ? (_jsx("p", { className: "text-sm text-slate-500", children: "\u041D\u0435\u0442 \u043F\u0440\u043E\u0434\u0430\u0436 \u0432 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u043C \u043F\u0435\u0440\u0438\u043E\u0434\u0435" })) : (_jsx("div", { className: "overflow-auto", children: _jsxs("table", { className: "min-w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b text-left text-slate-500", children: [_jsx("th", { className: "px-2 py-2", children: "\u041F\u0440\u043E\u0434\u0430\u0432\u0435\u0446" }), _jsx("th", { className: "px-2 py-2", children: "\u041A\u043E\u043B-\u0432\u043E \u043F\u0440\u043E\u0434\u0430\u0436" }), _jsx("th", { className: "px-2 py-2", children: "\u0420\u0435\u0430\u043B\u044C\u043D\u0430\u044F \u0432\u044B\u0440\u0443\u0447\u043A\u0430" })] }) }), _jsx("tbody", { children: data.by_seller.map((s) => (_jsxs("tr", { className: "border-b", children: [_jsx("td", { className: "px-2 py-2 font-medium", children: s.seller_name || `#${s.seller_id}` }), _jsx("td", { className: "px-2 py-2", children: s.sales_count }), _jsxs("td", { className: "px-2 py-2 font-semibold", children: [num(s.revenue), " \u0441\u043E\u043C"] })] }, s.seller_id))) })] }) }))] }), _jsxs("section", { className: "rounded-2xl bg-white p-4 shadow", children: [_jsxs("h2", { className: "mb-3 text-lg font-semibold", children: ["\u0412\u0441\u0435 \u043F\u0440\u043E\u0434\u0430\u0436\u0438 \u043F\u0435\u0440\u0438\u043E\u0434\u0430 (", sales.length, ")"] }), sales.length === 0 ? (_jsx("p", { className: "rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500", children: emptyMessage })) : (_jsx("div", { className: "overflow-auto", children: _jsxs("table", { className: "min-w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b text-left text-slate-500", children: [_jsx("th", { className: "px-2 py-2", children: "\u0414\u0430\u0442\u0430" }), _jsx("th", { className: "px-2 py-2", children: "\u041F\u0440\u043E\u0434\u0430\u0432\u0435\u0446" }), _jsx("th", { className: "px-2 py-2", children: "\u041A\u043B\u0438\u0435\u043D\u0442" }), _jsx("th", { className: "px-2 py-2", children: "\u041F\u043E\u0437\u0438\u0446\u0438\u0439" }), _jsx("th", { className: "px-2 py-2", children: "\u0422\u043E\u0432\u0430\u0440\u044B" }), _jsx("th", { className: "px-2 py-2", children: "\u0421\u0443\u043C\u043C\u0430" }), _jsx("th", { className: "px-2 py-2", children: "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043E" }), _jsx("th", { className: "px-2 py-2", children: "\u041C\u0435\u0442\u043E\u0434" }), _jsx("th", { className: "px-2 py-2", children: "\u0421\u0442\u0430\u0442\u0443\u0441" })] }) }), _jsx("tbody", { children: pagedSales.map((row, idx) => {
                                                const paid = Number(row.paid_cash) + Number(row.paid_card) + Number(row.paid_transfer);
                                                return (_jsxs("tr", { className: idx % 2 ? "bg-slate-50" : "", children: [_jsx("td", { className: "px-2 py-2 whitespace-nowrap", children: row.created_at ? new Date(row.created_at).toLocaleDateString() : "—" }), _jsx("td", { className: "px-2 py-2", children: row.seller_name || "—" }), _jsx("td", { className: "px-2 py-2", children: row.customer_name ?? "—" }), _jsx("td", { className: "px-2 py-2", children: row.items_count }), _jsx("td", { className: "px-2 py-2 max-w-xs truncate", title: row.items_names || undefined, children: row.items_names || "—" }), _jsx("td", { className: "px-2 py-2 font-medium", children: num(row.total) }), _jsx("td", { className: "px-2 py-2", children: paid.toFixed(2) }), _jsx("td", { className: "px-2 py-2 text-xs", children: detectPaymentMethod(row) }), _jsx("td", { className: "px-2 py-2", children: _jsx("span", { className: `rounded-full px-2 py-0.5 text-xs ${row.status === "debt"
                                                                    ? "bg-red-100 text-red-700"
                                                                    : row.status === "returned"
                                                                        ? "bg-amber-100 text-amber-700"
                                                                        : "bg-emerald-100 text-emerald-700"}`, children: STATUS_LABEL[row.status] ?? row.status }) })] }, row.id));
                                            }) })] }) })), sales.length > pageSize ? (_jsxs("div", { className: "mt-3 flex items-center justify-end gap-2", children: [_jsx("button", { className: "rounded-lg border px-3 py-1 text-sm disabled:opacity-50", disabled: page <= 1, onClick: () => setPage((p) => Math.max(1, p - 1)), children: "\u041D\u0430\u0437\u0430\u0434" }), _jsxs("span", { className: "text-sm text-slate-600", children: [page, " / ", totalPages] }), _jsx("button", { className: "rounded-lg border px-3 py-1 text-sm disabled:opacity-50", disabled: page >= totalPages, onClick: () => setPage((p) => Math.min(totalPages, p + 1)), children: "\u0412\u043F\u0435\u0440\u0451\u0434" })] })) : null] }), hasDelivery && data.deliveries && data.deliveries.count > 0 ? (_jsxs("section", { className: "mt-4 rounded-2xl bg-white p-4 shadow", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between", children: [_jsxs("h2", { className: "text-lg font-semibold", children: ["\uD83D\uDE9A \u0414\u043E\u0441\u0442\u0430\u0432\u043A\u0438 \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434 (", data.deliveries.count, ")"] }), _jsxs("span", { className: "text-sm font-semibold", children: [num(data.deliveries.total), " \u0441\u043E\u043C"] })] }), _jsx("div", { className: "overflow-auto", children: _jsxs("table", { className: "min-w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b text-left text-slate-500", children: [_jsx("th", { className: "px-2 py-2", children: "\u0427\u0435\u043A" }), _jsx("th", { className: "px-2 py-2", children: "\u0414\u0430\u0442\u0430 \u0447\u0435\u043A\u0430" }), _jsx("th", { className: "px-2 py-2", children: "\u041A\u043B\u0438\u0435\u043D\u0442" }), _jsx("th", { className: "px-2 py-2", children: "\u0410\u0434\u0440\u0435\u0441" }), _jsx("th", { className: "px-2 py-2", children: "\u0414\u0430\u0442\u0430 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438" }), _jsx("th", { className: "px-2 py-2", children: "\u0422\u0438\u043F" }), _jsx("th", { className: "px-2 py-2 text-right", children: "\u0426\u0435\u043D\u0430" })] }) }), _jsx("tbody", { children: data.deliveries.items.map((d, idx) => (_jsxs("tr", { className: idx % 2 ? "bg-slate-50" : "", children: [_jsxs("td", { className: "px-2 py-2", children: ["#", d.sale_id] }), _jsx("td", { className: "px-2 py-2 whitespace-nowrap", children: d.created_at ? new Date(d.created_at).toLocaleDateString() : "—" }), _jsx("td", { className: "px-2 py-2", children: d.customer_name ?? "—" }), _jsx("td", { className: "px-2 py-2", children: d.address ?? "—" }), _jsx("td", { className: "px-2 py-2 whitespace-nowrap", children: d.delivery_date ?? "—" }), _jsx("td", { className: "px-2 py-2 text-xs", children: d.type === "separate" ? "Отдельно" : d.type === "included" ? "Включена" : "—" }), _jsx("td", { className: "px-2 py-2 text-right tabular-nums font-medium", children: Number(d.price) > 0 ? `${num(d.price)} сом` : "—" })] }, d.sale_id))) })] }) })] })) : null, data.revisions_period && data.revisions_period.movements_count > 0 ? (_jsxs("section", { className: "mt-4 rounded-2xl bg-white p-4 shadow", children: [_jsxs("div", { className: "mb-3 flex flex-wrap items-center justify-between gap-2", children: [_jsxs("h2", { className: "text-lg font-semibold", children: ["\uD83D\uDCCB \u0420\u0435\u0432\u0438\u0437\u0438\u0438 \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434 (", data.revisions_period.movements_count, " \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u0439)"] }), _jsxs("span", { className: `text-sm font-semibold ${Number(data.revisions_period.net_value) >= 0 ? "text-emerald-700" : "text-red-700"}`, children: [Number(data.revisions_period.net_value) >= 0 ? "+" : "", num(data.revisions_period.net_value), " \u0441\u043E\u043C"] })] }), _jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [_jsxs("div", { className: "rounded-xl border bg-emerald-50 p-3 text-sm", children: [_jsx("p", { className: "text-xs text-emerald-700", children: "\u0418\u0437\u043B\u0438\u0448\u0435\u043A (\u043F\u043E \u0437\u0430\u043A\u0443\u043F\u043A\u0435)" }), _jsxs("p", { className: "mt-1 text-xl font-bold text-emerald-800", children: ["+", num(data.revisions_period.surplus_value), " \u0441\u043E\u043C"] })] }), _jsxs("div", { className: "rounded-xl border bg-red-50 p-3 text-sm", children: [_jsx("p", { className: "text-xs text-red-700", children: "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0447\u0430 (\u043F\u043E \u0437\u0430\u043A\u0443\u043F\u043A\u0435)" }), _jsxs("p", { className: "mt-1 text-xl font-bold text-red-800", children: ["\u2212", num(data.revisions_period.shortage_value), " \u0441\u043E\u043C"] })] })] }), _jsx("p", { className: "mt-2 text-xs text-slate-500", children: "\u0418\u0437\u043B\u0438\u0448\u0435\u043A \u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0430\u0447\u0430 \u0443\u0436\u0435 \u0443\u0447\u0442\u0435\u043D\u044B \u0432 \u043F\u0440\u0438\u0431\u044B\u043B\u0438 (\u0441\u043C. \u0431\u043B\u043E\u043A \u00AB\u0418\u0442\u043E\u0433\u00BB). \u041A\u0430\u0436\u0434\u043E\u0435 \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u0435 \u2014 \u044D\u0442\u043E \u043F\u0435\u0440\u0435\u0441\u0447\u0451\u0442 \u043E\u0441\u0442\u0430\u0442\u043A\u0430 \u043D\u0430 \u0441\u043A\u043B\u0430\u0434\u0435." })] })) : null, writeoffsQuery.data && writeoffsQuery.data.summary.count > 0 ? (_jsxs("section", { className: "mt-4 rounded-2xl bg-white p-4 shadow", children: [_jsxs("div", { className: "mb-3 flex flex-wrap items-center justify-between gap-2", children: [_jsxs("h2", { className: "text-lg font-semibold", children: ["\uD83D\uDCE6 \u041F\u043E\u0442\u0435\u0440\u0438 \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434 (", writeoffsQuery.data.summary.count, ")"] }), _jsxs("span", { className: "text-sm font-semibold text-red-700", children: ["\u2212", num(writeoffsQuery.data.summary.total_cost), " \u0441\u043E\u043C"] })] }), writeoffsQuery.data.by_reason.length > 0 ? (_jsx("div", { className: "mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3", children: writeoffsQuery.data.by_reason.map((r) => (_jsxs("div", { className: "rounded-xl border bg-slate-50 p-3 text-sm", children: [_jsx("p", { className: "font-semibold text-slate-700", children: WRITEOFF_LABEL[r.reason] ?? r.reason }), _jsxs("p", { className: "text-xs text-slate-500", children: [r.count, " \u043F\u043E\u0437\u0438\u0446\u0438\u0439 \u00B7 ", r.qty] }), _jsxs("p", { className: "mt-1 text-base font-bold text-red-700", children: ["\u2212", num(r.cost), " \u0441\u043E\u043C"] })] }, r.reason))) })) : null, _jsx("div", { className: "overflow-auto", children: _jsxs("table", { className: "min-w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b text-left text-slate-500", children: [_jsx("th", { className: "px-2 py-2", children: "\u0414\u0430\u0442\u0430" }), _jsx("th", { className: "px-2 py-2", children: "\u0422\u043E\u0432\u0430\u0440" }), _jsx("th", { className: "px-2 py-2", children: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F" }), _jsx("th", { className: "px-2 py-2 text-right", children: "\u041A\u043E\u043B-\u0432\u043E" }), _jsx("th", { className: "px-2 py-2 text-right", children: "\u0426\u0435\u043D\u0430" }), _jsx("th", { className: "px-2 py-2 text-right", children: "\u0421\u0443\u043C\u043C\u0430" }), _jsx("th", { className: "px-2 py-2", children: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439" })] }) }), _jsx("tbody", { children: writeoffsQuery.data.items.map((it, idx) => (_jsxs("tr", { className: idx % 2 ? "bg-slate-50" : "", children: [_jsx("td", { className: "px-2 py-2 whitespace-nowrap", children: it.created_at ? new Date(it.created_at).toLocaleDateString("ru-RU") : "—" }), _jsx("td", { className: "px-2 py-2", children: it.product_name }), _jsx("td", { className: "px-2 py-2 text-xs", children: WRITEOFF_LABEL[it.reason] ?? it.reason }), _jsx("td", { className: "px-2 py-2 text-right tabular-nums", children: it.qty }), _jsx("td", { className: "px-2 py-2 text-right tabular-nums", children: num(it.cost_per) }), _jsxs("td", { className: "px-2 py-2 text-right tabular-nums font-semibold text-red-700", children: ["\u2212", num(it.cost_total)] }), _jsx("td", { className: "px-2 py-2 text-xs text-slate-600", children: it.comment || "—" })] }, it.id))) })] }) })] })) : null, data.installations && data.installations.count > 0 ? (_jsxs("section", { className: "mt-4 rounded-2xl bg-white p-4 shadow", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between", children: [_jsxs("h2", { className: "text-lg font-semibold", children: ["\uD83D\uDEE0 \u0423\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434 (", data.installations.count, ")"] }), _jsxs("span", { className: "text-sm font-semibold", children: [num(data.installations.total), " \u0441\u043E\u043C"] })] }), _jsx("div", { className: "overflow-auto", children: _jsxs("table", { className: "min-w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b text-left text-slate-500", children: [_jsx("th", { className: "px-2 py-2", children: "\u0427\u0435\u043A" }), _jsx("th", { className: "px-2 py-2", children: "\u0414\u0430\u0442\u0430" }), _jsx("th", { className: "px-2 py-2", children: "\u041A\u043B\u0438\u0435\u043D\u0442" }), _jsx("th", { className: "px-2 py-2 text-right", children: "\u0426\u0435\u043D\u0430" })] }) }), _jsx("tbody", { children: data.installations.items.map((i, idx) => (_jsxs("tr", { className: idx % 2 ? "bg-slate-50" : "", children: [_jsxs("td", { className: "px-2 py-2", children: ["#", i.sale_id] }), _jsx("td", { className: "px-2 py-2 whitespace-nowrap", children: i.created_at ? new Date(i.created_at).toLocaleDateString() : "—" }), _jsx("td", { className: "px-2 py-2", children: i.customer_name ?? "—" }), _jsx("td", { className: "px-2 py-2 text-right tabular-nums font-medium", children: Number(i.price) > 0 ? `${num(i.price)} сом` : "—" })] }, i.sale_id))) })] }) })] })) : null, debtPaymentsQuery.data && debtPaymentsQuery.data.count > 0 ? (_jsxs("section", { className: "mt-4 rounded-2xl bg-white p-4 shadow", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between", children: [_jsxs("h2", { className: "text-lg font-semibold", children: ["\uD83D\uDCB5 \u041F\u043E\u0433\u0430\u0448\u0435\u043D\u0438\u044F \u0434\u043E\u043B\u0433\u043E\u0432 (", debtPaymentsQuery.data.count, ")"] }), _jsxs("span", { className: "text-sm font-semibold text-emerald-700", children: [num(debtPaymentsQuery.data.total), " \u0441\u043E\u043C"] })] }), _jsx("div", { className: "overflow-auto", children: _jsxs("table", { className: "min-w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b text-left text-slate-500", children: [_jsx("th", { className: "px-2 py-2", children: "\u0414\u0430\u0442\u0430" }), _jsx("th", { className: "px-2 py-2", children: "\u041A\u043B\u0438\u0435\u043D\u0442" }), _jsx("th", { className: "px-2 py-2", children: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D" }), _jsx("th", { className: "px-2 py-2 text-right", children: "\u0421\u0443\u043C\u043C\u0430" }), _jsx("th", { className: "px-2 py-2", children: "\u0421\u043F\u043E\u0441\u043E\u0431" }), _jsx("th", { className: "px-2 py-2", children: "\u041F\u0440\u043E\u0434\u0430\u0432\u0435\u0446" }), _jsx("th", { className: "px-2 py-2", children: "\u041A \u043F\u0440\u043E\u0434\u0430\u0436\u0435" }), _jsx("th", { className: "px-2 py-2", children: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439" })] }) }), _jsx("tbody", { children: debtPaymentsQuery.data.payments.map((p, idx) => (_jsxs("tr", { className: idx % 2 ? "bg-slate-50" : "", children: [_jsx("td", { className: "px-2 py-2 whitespace-nowrap", children: p.created_at ? new Date(p.created_at).toLocaleString("ru-RU") : "—" }), _jsx("td", { className: "px-2 py-2 font-medium", children: p.customer_name }), _jsx("td", { className: "px-2 py-2 text-xs text-slate-500", children: p.customer_phone }), _jsx("td", { className: "px-2 py-2 text-right font-semibold text-emerald-700", children: num(p.amount) }), _jsx("td", { className: "px-2 py-2", children: p.method === "cash" ? "Нал" : p.method === "card" ? "Карта" : "Перевод" }), _jsx("td", { className: "px-2 py-2", children: p.created_by ?? "—" }), _jsx("td", { className: "px-2 py-2 text-slate-500", children: p.sale_id ? `#${p.sale_id}` : "—" }), _jsx("td", { className: "px-2 py-2 text-xs text-slate-600", children: p.comment ?? "" })] }, p.id))) })] }) })] })) : null, _jsx(AccountingSummary, { data: data, salaryInput: salaryInput, setSalaryInput: setSalaryInput, otherExpensesList: otherExpensesList, setOtherExpensesList: setOtherExpensesList, onSave: () => saveExpensesMutation.mutate(), isSaving: saveExpensesMutation.isPending, isSaved: saveExpensesMutation.isSuccess, editable: expensesEditable })] })) : null, showPinModal ? (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4", children: _jsxs("div", { className: "w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl", children: [_jsx("h3", { className: "text-xl font-semibold", children: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 Report PIN" }), _jsx("p", { className: "mt-1 text-sm text-slate-500", children: "\u0414\u043E\u0441\u0442\u0443\u043F \u043A \u043E\u0442\u0447\u0451\u0442\u0430\u043C \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430" }), _jsx("input", { type: "password", maxLength: 4, autoFocus: true, className: "mt-4 w-full rounded-xl border p-3 text-center text-xl tracking-[0.4em]", placeholder: "\u2022\u2022\u2022\u2022", value: pinInput, onChange: (e) => {
                                setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4));
                                if (pinError)
                                    setPinError("");
                            } }), pinError ? _jsx("p", { className: "mt-2 text-sm text-red-600", children: pinError }) : null, _jsx("button", { className: "mt-4 w-full rounded-xl bg-primary p-3 font-medium text-white disabled:opacity-50", disabled: pinInput.length < 4, onClick: () => {
                                setReportPin(pinInput);
                                setShowPinModal(false);
                                setPinError("");
                            }, children: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C" })] }) })) : null] }));
}
function num(value) {
    const n = typeof value === "string" ? Number(value) : value;
    return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}
function AccountingSummary({ data, salaryInput, setSalaryInput, otherExpensesList, setOtherExpensesList, onSave, isSaving, isSaved, editable, }) {
    const cashIn = Number(data.revenue.cash);
    const cardIn = Number(data.revenue.card);
    const transferIn = Number(data.revenue.transfer);
    const inkas = Number(data.cash_withdrawals.total);
    const sale = Number(data.revenue.total); // продажа уже с учётом скидок
    const cost = Number(data.sales.cost_total ?? 0);
    const salary = Math.max(0, Number(salaryInput) || 0);
    const other = otherExpensesList.reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0);
    const updateRow = (idx, patch) => {
        setOtherExpensesList(otherExpensesList.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    };
    const addRow = () => {
        setOtherExpensesList([...otherExpensesList, { amount: "", comment: "" }]);
    };
    const removeRow = (idx) => {
        setOtherExpensesList(otherExpensesList.filter((_, i) => i !== idx));
    };
    // Сколько должно быть к концу периода — наличка минус инкассация, карта и
    // перевод трогаются только если из них что-то выдают (по умолчанию нет).
    const cashLeft = cashIn - inkas;
    const cardLeft = cardIn;
    const transferLeft = transferIn;
    // Прибыль без инкассации (это просто перемещение денег, не расход бизнеса)
    // и без скидки (она уже в продаже). Плюс излишек/недостача ревизии (rev_net).
    const revNet = Number(data.revisions_period?.net_value ?? 0);
    const profit = sale - cost - salary - other + revNet;
    return (_jsxs("section", { className: "mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm", children: [_jsxs("div", { className: "border-b bg-slate-50 px-4 py-3", children: [_jsx("h2", { className: "text-lg font-semibold", children: "\u0418\u0442\u043E\u0433 \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434" }), _jsx("p", { className: "text-xs text-slate-500", children: "\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u0434\u0435\u043D\u0435\u0433 \u0438 \u0440\u0430\u0441\u0447\u0451\u0442 \u043F\u0440\u0438\u0431\u044B\u043B\u0438" })] }), _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsx("tr", { className: "border-b bg-slate-50", children: _jsx("th", { colSpan: 2, className: "px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500", children: "\u0414\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u043A \u043A\u043E\u043D\u0446\u0443 \u043F\u0435\u0440\u0438\u043E\u0434\u0430" }) }) }), _jsxs("tbody", { children: [_jsxs("tr", { className: "border-b", children: [_jsx("td", { className: "px-4 py-3", children: "\uD83D\uDCB5 \u041D\u0430\u043B\u0438\u0447\u043D\u044B\u0435 \u0432 \u043A\u0430\u0441\u0441\u0435" }), _jsxs("td", { className: "px-4 py-3 text-right tabular-nums font-semibold", children: [num(cashLeft), " \u0441\u043E\u043C"] })] }), inkas > 0 ? (_jsxs("tr", { className: "border-b text-xs text-slate-500", children: [_jsxs("td", { className: "px-4 pb-2 pl-8", children: ["\u0438\u0437 \u043D\u0438\u0445 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u043E: ", num(cashIn), " \u0441\u043E\u043C, \u0438\u043D\u043A\u0430\u0441\u0441\u0430\u0446\u0438\u044F: \u2212", num(inkas), " \u0441\u043E\u043C"] }), _jsx("td", {})] })) : null, data.revenue.debt_payments && Number(data.revenue.debt_payments.total) > 0 ? (_jsxs("tr", { className: "border-b text-xs text-slate-500", children: [_jsxs("td", { className: "px-4 pb-2 pl-8", children: ["\u0438\u0437 \u0432\u044B\u0440\u0443\u0447\u043A\u0438 ", _jsxs("b", { children: [num(data.revenue.sales_only?.total ?? 0), " \u0441\u043E\u043C"] }), " \u2014 \u043F\u0440\u043E\u0434\u0430\u0436\u0438,", " ", _jsxs("b", { children: [num(data.revenue.debt_payments.total), " \u0441\u043E\u043C"] }), " \u2014 \u043F\u043E\u0433\u0430\u0448\u0435\u043D\u0438\u0435 \u0434\u043E\u043B\u0433\u043E\u0432 (\u043D\u0430\u043B ", num(data.revenue.debt_payments.cash), ", \u043A\u0430\u0440\u0442\u0430 ", num(data.revenue.debt_payments.card), ", \u043F\u0435\u0440\u0435\u0432\u043E\u0434 ", num(data.revenue.debt_payments.transfer), ")"] }), _jsx("td", {})] })) : null, _jsxs("tr", { className: "border-b", children: [_jsx("td", { className: "px-4 py-3", children: "\uD83D\uDCB3 \u041D\u0430 \u043A\u0430\u0440\u0442\u0435" }), _jsxs("td", { className: "px-4 py-3 text-right tabular-nums font-semibold", children: [num(cardLeft), " \u0441\u043E\u043C"] })] }), _jsxs("tr", { className: "border-b", children: [_jsx("td", { className: "px-4 py-3", children: "\uD83D\uDCF1 \u041D\u0430 \u0441\u0447\u0451\u0442\u0435 (\u043F\u0435\u0440\u0435\u0432\u043E\u0434\u044B)" }), _jsxs("td", { className: "px-4 py-3 text-right tabular-nums font-semibold", children: [num(transferLeft), " \u0441\u043E\u043C"] })] }), _jsxs("tr", { className: "border-b bg-slate-50", children: [_jsx("td", { className: "px-4 py-3 font-semibold", children: "\u0412\u0441\u0435\u0433\u043E \u0434\u0435\u043D\u0435\u0433" }), _jsxs("td", { className: "px-4 py-3 text-right tabular-nums font-bold", children: [num(cashLeft + cardLeft + transferLeft), " \u0441\u043E\u043C"] })] })] })] }), _jsxs("table", { className: "w-full border-t-4 border-slate-200 text-sm", children: [_jsx("thead", { children: _jsx("tr", { className: "border-b bg-slate-50", children: _jsx("th", { colSpan: 2, className: "px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500", children: "\u0420\u0430\u0441\u0447\u0451\u0442 \u043F\u0440\u0438\u0431\u044B\u043B\u0438" }) }) }), _jsxs("tbody", { children: [_jsxs("tr", { className: "border-b", children: [_jsx("td", { className: "px-4 py-3", children: "\u041F\u0440\u043E\u0434\u0430\u0436\u0430 (\u0441 \u0443\u0447\u0451\u0442\u043E\u043C \u0441\u043A\u0438\u0434\u043E\u043A)" }), _jsxs("td", { className: "px-4 py-3 text-right tabular-nums", children: [num(sale), " \u0441\u043E\u043C"] })] }), _jsxs("tr", { className: "border-b", children: [_jsx("td", { className: "px-4 py-3", children: "\u0420\u0430\u0441\u0445\u043E\u0434 (\u0437\u0430\u043A\u0443\u043F\u043E\u0447\u043D\u0430\u044F \u0441\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C \u0442\u043E\u0432\u0430\u0440\u043E\u0432)" }), _jsxs("td", { className: "px-4 py-3 text-right tabular-nums text-red-700", children: ["\u2212", num(cost), " \u0441\u043E\u043C"] })] }), _jsxs("tr", { className: "border-b", children: [_jsx("td", { className: "px-4 py-3", children: "\u0417\u0430\u0440\u043F\u043B\u0430\u0442\u0430 \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u0430 \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434" }), _jsxs("td", { className: "px-4 py-3 text-right", children: [_jsx("input", { type: "text", inputMode: "decimal", value: salaryInput, onChange: (e) => setSalaryInput(e.target.value), onFocus: (e) => { if (e.target.value === "0")
                                                    setSalaryInput(""); }, placeholder: "0", readOnly: !editable, className: `h-9 w-32 rounded-lg border px-3 text-right tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${editable ? "border-slate-300" : "border-slate-200 bg-slate-50 text-slate-500"}` }), _jsx("span", { className: "ml-1 text-slate-500", children: "\u0441\u043E\u043C" })] })] }), otherExpensesList.map((row, idx) => (_jsxs("tr", { className: "border-b", children: [_jsxs("td", { className: "px-4 py-3", children: [idx === 0 ? (_jsxs(_Fragment, { children: ["\u041F\u0440\u043E\u0447\u0438\u0435 \u0440\u0430\u0441\u0445\u043E\u0434\u044B", _jsx("span", { className: "ml-1 text-xs text-slate-500", children: "(\u0430\u0440\u0435\u043D\u0434\u0430, \u043A\u043E\u043C\u043C\u0443\u043D\u0430\u043B\u044C\u043D\u044B\u0435, \u043D\u0430\u043B\u043E\u0433\u0438, \u0443\u0431\u043E\u0440\u043A\u0430)" })] })) : (_jsx("span", { className: "text-slate-600", children: "\u041F\u0440\u043E\u0447\u0438\u0435 \u0440\u0430\u0441\u0445\u043E\u0434\u044B" })), _jsx("div", { className: "mt-1", children: _jsx("input", { type: "text", value: row.comment, onChange: (e) => updateRow(idx, { comment: e.target.value }), placeholder: "\u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u0430\u0440\u0435\u043D\u0434\u0430)", readOnly: !editable, className: `h-8 w-full max-w-md rounded-lg border px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${editable ? "border-slate-300" : "border-slate-200 bg-slate-50 text-slate-500"}` }) })] }), _jsx("td", { className: "px-4 py-3 text-right align-top", children: _jsxs("div", { className: "flex items-center justify-end gap-2", children: [_jsx("input", { type: "text", inputMode: "decimal", value: row.amount, onChange: (e) => updateRow(idx, { amount: e.target.value }), onFocus: (e) => { if (e.target.value === "0")
                                                        updateRow(idx, { amount: "" }); }, placeholder: "0", readOnly: !editable, className: `h-9 w-32 rounded-lg border px-3 text-right tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${editable ? "border-slate-300" : "border-slate-200 bg-slate-50 text-slate-500"}` }), _jsx("span", { className: "text-slate-500", children: "\u0441\u043E\u043C" }), editable && otherExpensesList.length > 1 ? (_jsx("button", { type: "button", onClick: () => removeRow(idx), className: "ml-1 flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-slate-500 hover:border-red-400 hover:bg-red-50 hover:text-red-600", title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u0442\u0440\u043E\u043A\u0443", children: "\u00D7" })) : null] }) })] }, idx))), editable ? (_jsx("tr", { className: "border-b", children: _jsx("td", { colSpan: 2, className: "px-4 py-2", children: _jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [_jsxs("button", { type: "button", onClick: addRow, className: "inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:border-primary hover:text-primary", children: [_jsx("span", { className: "text-lg leading-none", children: "+" }), "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0441\u0442\u0440\u043E\u043A\u0443 \u043F\u0440\u043E\u0447\u0438\u0445 \u0440\u0430\u0441\u0445\u043E\u0434\u043E\u0432"] }), _jsxs("button", { type: "button", onClick: onSave, disabled: isSaving, className: "inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60", children: ["\uD83D\uDCBE ", isSaving ? "Сохраняю…" : isSaved ? "Сохранено ✓" : "Сохранить"] })] }) }) })) : (_jsx("tr", { className: "border-b bg-amber-50", children: _jsx("td", { colSpan: 2, className: "px-4 py-2 text-xs text-amber-800", children: "\u0412\u044B\u0431\u0440\u0430\u043D \u043F\u0435\u0440\u0438\u043E\u0434 \u0438\u0437 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u0438\u0445 \u0434\u043D\u0435\u0439 \u2014 \u0437\u0430\u0440\u043F\u043B\u0430\u0442\u0430 \u0438 \u043F\u0440\u043E\u0447\u0438\u0435 \u0440\u0430\u0441\u0445\u043E\u0434\u044B \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043F\u0440\u043E\u0441\u0443\u043C\u043C\u0438\u0440\u043E\u0432\u0430\u043D\u044B \u0437\u0430 \u044D\u0442\u043E\u0442 \u043F\u0435\u0440\u0438\u043E\u0434. \u0427\u0442\u043E\u0431\u044B \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0438\u043B\u0438 \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0440\u0430\u0441\u0445\u043E\u0434, \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0439 \u0434\u0435\u043D\u044C (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, \u00AB\u0421\u0435\u0433\u043E\u0434\u043D\u044F\u00BB \u0438\u043B\u0438 \u043E\u0434\u0438\u043D \u0434\u0435\u043D\u044C \u0432 \u00AB\u0417\u0430 \u043F\u0435\u0440\u0438\u043E\u0434\u00BB)." }) })), revNet !== 0 ? (_jsxs("tr", { className: "border-b", children: [_jsxs("td", { className: "px-4 py-3", children: ["\u0418\u0437\u043B\u0438\u0448\u0435\u043A / \u043D\u0435\u0434\u043E\u0441\u0442\u0430\u0447\u0430 \u0440\u0435\u0432\u0438\u0437\u0438\u0438", _jsx("span", { className: "ml-1 text-xs text-slate-500", children: "(\u043F\u043E \u0437\u0430\u043A\u0443\u043F\u043E\u0447\u043D\u043E\u0439 \u0446\u0435\u043D\u0435)" })] }), _jsxs("td", { className: `px-4 py-3 text-right tabular-nums ${revNet >= 0 ? "text-emerald-700" : "text-red-700"}`, children: [revNet >= 0 ? "+" : "", num(revNet), " \u0441\u043E\u043C"] })] })) : null, _jsxs("tr", { className: "bg-emerald-50", children: [_jsx("td", { className: "px-4 py-4 text-base font-semibold", children: "\u041F\u0420\u0418\u0411\u042B\u041B\u042C" }), _jsxs("td", { className: `px-4 py-4 text-right tabular-nums text-2xl font-bold ${profit >= 0 ? "text-emerald-700" : "text-red-700"}`, children: [num(profit), " \u0441\u043E\u043C"] })] })] })] }), _jsx("div", { className: "border-t bg-slate-50 px-4 py-2 text-xs text-slate-500", children: "\u041F\u0440\u0438\u0431\u044B\u043B\u044C = \u041F\u0440\u043E\u0434\u0430\u0436\u0430 \u2212 \u0420\u0430\u0441\u0445\u043E\u0434 \u2212 \u0417\u0430\u0440\u043F\u043B\u0430\u0442\u0430 \u2212 \u041F\u0440\u043E\u0447\u0438\u0435 \u0440\u0430\u0441\u0445\u043E\u0434\u044B. \u0421\u043A\u0438\u0434\u043A\u0430 \u0443\u0436\u0435 \u0443\u0447\u0442\u0435\u043D\u0430 \u0432 \u043F\u0440\u043E\u0434\u0430\u0436\u0435, \u0438\u043D\u043A\u0430\u0441\u0441\u0430\u0446\u0438\u044F \u2014 \u044D\u0442\u043E \u043F\u0435\u0440\u0435\u043C\u0435\u0449\u0435\u043D\u0438\u0435 \u0434\u0435\u043D\u0435\u0433, \u043D\u0435 \u0440\u0430\u0441\u0445\u043E\u0434." })] }));
}
