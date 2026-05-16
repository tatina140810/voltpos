import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NumberInput } from "../components/NumberInput";
import { api } from "../lib/api";
const METHOD_LABEL = {
    cash: "💵 Наличными",
    card: "💳 Картой",
    transfer: "📱 Переводом",
};
const KIND_LABEL = {
    inkas: "🏦 Инкассация в банк",
    owner: "👤 Выдача владельцу",
    expense: "📝 Текущий расход",
    supplier: "🏭 Оплата поставщику",
    other: "📦 Другое",
};
export function CashWithdrawalsPage() {
    const queryClient = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [recipient, setRecipient] = useState("");
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");
    const [method, setMethod] = useState("cash");
    const [kind, setKind] = useState("expense");
    const [supplierId, setSupplierId] = useState(null);
    const [supplierSearch, setSupplierSearch] = useState("");
    const listQuery = useQuery({
        queryKey: ["cash-withdrawals"],
        queryFn: async () => (await api.get("/cash-withdrawals")).data,
    });
    const suppliersQuery = useQuery({
        queryKey: ["suppliers"],
        queryFn: async () => (await api.get("/suppliers")).data,
    });
    const todayQuery = useQuery({
        queryKey: ["cash-withdrawals-today-total"],
        queryFn: async () => (await api.get("/cash-withdrawals/today/total")).data,
    });
    const resetForm = () => {
        setShowForm(false);
        setRecipient("");
        setAmount("");
        setReason("");
        setMethod("cash");
        setKind("expense");
        setSupplierId(null);
        setSupplierSearch("");
    };
    const createMutation = useMutation({
        mutationFn: async () => api.post("/cash-withdrawals", {
            recipient: recipient.trim(),
            amount: Number(String(amount).replace(",", ".")) || 0,
            reason: reason.trim() || null,
            method,
            kind,
            supplier_id: kind === "supplier" ? supplierId : null,
        }),
        onSuccess: async () => {
            resetForm();
            await queryClient.invalidateQueries({ queryKey: ["cash-withdrawals"] });
            await queryClient.invalidateQueries({ queryKey: ["cash-withdrawals-today-total"] });
        },
        onError: (err) => {
            const detail = err.response?.data?.detail;
            alert(detail ?? "Не удалось сохранить");
        },
    });
    const deleteMutation = useMutation({
        mutationFn: async (id) => api.delete(`/cash-withdrawals/${id}`),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["cash-withdrawals"] });
            await queryClient.invalidateQueries({ queryKey: ["cash-withdrawals-today-total"] });
        },
        onError: (err) => {
            const status = err?.response?.status;
            alert(status === 403 ? "Удалять может только владелец" : "Не удалось удалить");
        },
    });
    const items = useMemo(() => listQuery.data ?? [], [listQuery.data]);
    const todayTotal = Number(todayQuery.data?.total ?? 0);
    // Когда юзер выбирает kind=supplier — пытаемся автоподобрать поставщика по введённому имени.
    const onSupplierSearchChange = (v) => {
        setSupplierSearch(v);
        const match = (suppliersQuery.data ?? []).find((s) => s.name === v);
        setSupplierId(match ? match.id : null);
        if (match)
            setRecipient(match.name);
    };
    const canSubmit = recipient.trim().length > 0 &&
        Number(String(amount).replace(",", ".")) > 0 &&
        !createMutation.isPending &&
        (kind !== "supplier" || supplierId !== null);
    return (_jsxs("main", { children: [_jsxs("div", { className: "mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between", children: [_jsx("h1", { className: "text-3xl font-semibold", children: "\u0414\u0432\u0438\u0436\u0435\u043D\u0438\u0435 \u0434\u0435\u043D\u0435\u0433" }), _jsx("button", { onClick: () => setShowForm(true), className: "rounded-xl bg-primary px-4 py-3 text-white", children: "+ \u041D\u043E\u0432\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C" })] }), _jsxs("div", { className: "mb-4 grid grid-cols-1 gap-3 md:grid-cols-3", children: [_jsxs("div", { className: "rounded-2xl bg-white p-4 shadow", children: [_jsx("p", { className: "text-xs text-slate-500", children: "\u0412\u044B\u0434\u0430\u043D\u043E \u0441\u0435\u0433\u043E\u0434\u043D\u044F (\u0432\u0441\u0435 \u043C\u0435\u0442\u043E\u0434\u044B)" }), _jsxs("p", { className: "text-3xl font-bold text-red-600", children: ["\u2212", todayTotal.toFixed(2), " \u0441\u043E\u043C"] })] }), _jsxs("div", { className: "rounded-2xl bg-white p-4 shadow md:col-span-2", children: [_jsx("p", { className: "text-xs text-slate-500", children: "\u0412\u0441\u0435\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u0432 \u0438\u0441\u0442\u043E\u0440\u0438\u0438" }), _jsx("p", { className: "text-3xl font-bold", children: items.length })] })] }), _jsxs("div", { className: "rounded-2xl bg-white p-4 shadow", children: [_jsx("h2", { className: "mb-3 text-lg font-semibold", children: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F" }), _jsx("div", { className: "space-y-2", children: items.length === 0 ? (_jsx("p", { className: "text-sm text-slate-500", children: "\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0437\u0430\u043F\u0438\u0441\u0435\u0439. \u0416\u043C\u0438 \u00AB+ \u041D\u043E\u0432\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C\u00BB." })) : (items.map((row) => {
                            const dt = new Date(row.created_at);
                            const m = (row.method ?? "cash");
                            const k = (row.kind ?? "expense");
                            return (_jsxs("div", { className: "flex flex-col gap-1 rounded-xl border p-3 md:flex-row md:items-center md:justify-between", children: [_jsxs("div", { className: "flex-1", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("span", { className: "rounded-full bg-slate-100 px-2 py-0.5 text-xs", children: KIND_LABEL[k] }), _jsx("span", { className: "rounded-full bg-slate-100 px-2 py-0.5 text-xs", children: METHOD_LABEL[m] }), _jsx("p", { className: "font-semibold", children: row.supplier_name ?? row.recipient }), _jsxs("p", { className: "text-xl font-bold text-red-600", children: ["\u2212", Number(row.amount).toFixed(2), " \u0441\u043E\u043C"] })] }), row.reason ? _jsx("p", { className: "mt-1 text-sm text-slate-600", children: row.reason }) : null, _jsxs("p", { className: "text-xs text-slate-500", children: [dt.toLocaleString("ru-RU"), " \u00B7 \u0432\u044B\u0434\u0430\u043B: ", row.issued_by_name ?? `#${row.issued_by_id}`] })] }), _jsx("button", { type: "button", onClick: () => {
                                            if (window.confirm(`Удалить запись на ${Number(row.amount).toFixed(2)} сом?`)) {
                                                deleteMutation.mutate(row.id);
                                            }
                                        }, disabled: deleteMutation.isPending, className: "text-sm text-red-600 disabled:opacity-50 md:ml-3", title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C (\u0442\u043E\u043B\u044C\u043A\u043E \u0432\u043B\u0430\u0434\u0435\u043B\u0435\u0446)", children: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C" })] }, row.id));
                        })) })] }), showForm ? (_jsx("div", { className: "fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 overflow-auto", children: _jsxs("div", { className: "mt-8 w-full max-w-md rounded-2xl bg-white p-4", children: [_jsx("h2", { className: "mb-3 text-xl font-semibold", children: "\u041D\u043E\u0432\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C" }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F" }), _jsx("select", { className: "w-full rounded-xl border bg-white p-3", value: kind, onChange: (e) => {
                                                const k = e.target.value;
                                                setKind(k);
                                                if (k !== "supplier") {
                                                    setSupplierId(null);
                                                    setSupplierSearch("");
                                                }
                                            }, children: Object.entries(KIND_LABEL).map(([v, label]) => (_jsx("option", { value: v, children: label }, v))) })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0421\u043F\u043E\u0441\u043E\u0431 \u043E\u043F\u043B\u0430\u0442\u044B" }), _jsx("select", { className: "w-full rounded-xl border bg-white p-3", value: method, onChange: (e) => setMethod(e.target.value), children: Object.entries(METHOD_LABEL).map(([v, label]) => (_jsx("option", { value: v, children: label }, v))) })] }), kind === "supplier" ? (_jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u041F\u043E\u0441\u0442\u0430\u0432\u0449\u0438\u043A" }), _jsx("input", { className: "w-full rounded-xl border p-3", list: "cw-suppliers-list", value: supplierSearch, onChange: (e) => onSupplierSearchChange(e.target.value), placeholder: "\u041D\u0430\u0447\u043D\u0438 \u0432\u0432\u043E\u0434\u0438\u0442\u044C \u0438\u043C\u044F \u043F\u043E\u0441\u0442\u0430\u0432\u0449\u0438\u043A\u0430\u2026" }), _jsx("datalist", { id: "cw-suppliers-list", children: (suppliersQuery.data ?? []).map((s) => (_jsx("option", { value: s.name }, s.id))) }), supplierSearch && !supplierId ? (_jsx("p", { className: "mt-1 text-xs text-amber-700", children: "\u042D\u0442\u043E\u0433\u043E \u043F\u043E\u0441\u0442\u0430\u0432\u0449\u0438\u043A\u0430 \u043D\u0435\u0442 \u0432 \u0431\u0430\u0437\u0435. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0434\u043E\u0431\u0430\u0432\u044C \u0435\u0433\u043E \u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u0435 \u00AB\u041F\u043E\u0441\u0442\u0430\u0432\u0449\u0438\u043A\u0438\u00BB." })) : null] })) : (_jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u041A\u043E\u043C\u0443 / \u043D\u0430 \u0447\u0442\u043E" }), _jsx("input", { className: "w-full rounded-xl border p-3", placeholder: "\u0418\u043C\u044F \u043F\u043E\u043B\u0443\u0447\u0430\u0442\u0435\u043B\u044F / \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", value: recipient, onChange: (e) => setRecipient(e.target.value), autoFocus: true })] })), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0421\u0443\u043C\u043C\u0430 (\u0441\u043E\u043C)" }), _jsx(NumberInput, { className: "w-full rounded-xl border p-3", placeholder: "0", value: amount, onChange: setAmount })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)" }), _jsx("input", { className: "w-full rounded-xl border p-3", placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u0437\u0430 \u043C\u043E\u043B\u043E\u043A\u043E 12.05, \u0431\u0435\u0437 \u0447\u0435\u043A\u0430", value: reason, onChange: (e) => setReason(e.target.value) })] })] }), _jsxs("div", { className: "mt-4 flex gap-2", children: [_jsx("button", { onClick: () => createMutation.mutate(), disabled: !canSubmit, className: "flex-1 rounded-xl bg-primary p-3 text-white disabled:opacity-50", children: createMutation.isPending ? "Сохранение..." : "Сохранить" }), _jsx("button", { className: "flex-1 rounded-xl border p-3", onClick: resetForm, children: "\u041E\u0442\u043C\u0435\u043D\u0430" })] })] }) })) : null] }));
}
