import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NumberInput } from "../components/NumberInput";
import { api } from "../lib/api";
const METHOD_LABEL = {
    cash: "Наличными",
    card: "Картой",
    transfer: "Переводом",
};
const SALE_STATUS_LABEL = {
    completed: "Оплачено",
    debt: "Долг",
    returned: "Возврат",
};
export function CustomersPage() {
    const [search, setSearch] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [form, setForm] = useState({ name: "", phone: "", address: "", discount_percent: "0" });
    const queryClient = useQueryClient();
    const customersQuery = useQuery({
        queryKey: ["customers", search],
        queryFn: async () => {
            const response = await api.get("/customers", { params: { search: search || undefined } });
            return response.data;
        },
    });
    const createMutation = useMutation({
        mutationFn: async () => api.post("/customers", {
            name: form.name,
            phone: form.phone,
            address: form.address || null,
            discount_percent: Number(form.discount_percent || 0),
        }),
        onSuccess: async () => {
            setShowForm(false);
            setForm({ name: "", phone: "", address: "", discount_percent: "0" });
            await queryClient.invalidateQueries({ queryKey: ["customers"] });
        },
    });
    // Sort: debtors first (oldest debt on top), then everyone else by id desc.
    const customers = useMemo(() => {
        const list = [...(customersQuery.data ?? [])];
        list.sort((a, b) => {
            const aDebt = Number(a.debt_amount || 0);
            const bDebt = Number(b.debt_amount || 0);
            if (aDebt > 0 && bDebt === 0)
                return -1;
            if (aDebt === 0 && bDebt > 0)
                return 1;
            if (aDebt > 0 && bDebt > 0) {
                const aDate = a.oldest_debt_date ? new Date(a.oldest_debt_date).getTime() : 0;
                const bDate = b.oldest_debt_date ? new Date(b.oldest_debt_date).getTime() : 0;
                return aDate - bDate; // oldest debt first
            }
            return b.id - a.id;
        });
        return list;
    }, [customersQuery.data]);
    const totalDebt = useMemo(() => customers.reduce((acc, c) => acc + Number(c.debt_amount || 0), 0), [customers]);
    return (_jsxs("main", { children: [_jsxs("div", { className: "mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between", children: [_jsx("h1", { className: "text-3xl font-semibold", children: "\u041A\u043B\u0438\u0435\u043D\u0442\u044B" }), _jsx("button", { onClick: () => setShowForm(true), className: "rounded-xl bg-primary px-4 py-3 text-white", children: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043A\u043B\u0438\u0435\u043D\u0442\u0430" })] }), _jsxs("div", { className: "rounded-2xl bg-white p-4 shadow", children: [_jsx("input", { value: search, onChange: (e) => setSearch(e.target.value), placeholder: "\u041F\u043E\u0438\u0441\u043A \u043F\u043E \u0438\u043C\u0435\u043D\u0438 \u0438 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0443", className: "mb-4 w-full rounded-xl border p-3" }), _jsxs("div", { className: "space-y-2", children: [customers.map((customer) => {
                                const debt = Number(customer.debt_amount || 0);
                                const oldestDebt = customer.oldest_debt_date
                                    ? new Date(customer.oldest_debt_date).toLocaleDateString()
                                    : null;
                                return (_jsx("button", { type: "button", onClick: () => setSelectedId(customer.id), className: `block w-full rounded-xl border p-3 text-left transition-colors hover:bg-slate-50 ${debt > 0 ? "border-red-300 bg-red-50" : ""}`, children: _jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsx("p", { className: "font-semibold", children: customer.name }), _jsx("p", { className: "text-sm text-slate-600", children: customer.phone })] }), _jsxs("div", { className: "text-right text-sm", children: [debt > 0 ? (_jsxs(_Fragment, { children: [_jsxs("p", { className: "text-base font-bold text-red-600", children: ["\u0414\u043E\u043B\u0433: ", debt.toFixed(2), " \u0441\u043E\u043C"] }), oldestDebt ? _jsxs("p", { className: "text-xs text-red-700", children: ["\u0441 ", oldestDebt] }) : null] })) : (_jsxs("p", { children: ["\u0421\u043A\u0438\u0434\u043A\u0430: ", Number(customer.discount_percent ?? 0).toFixed(0), "%"] })), _jsxs("p", { className: "text-slate-500", children: ["\u041F\u043E\u043A\u0443\u043F\u043E\u043A: ", customer.purchase_count ?? 0] })] })] }) }, customer.id));
                            }), !customers.length ? _jsx("p", { className: "text-sm text-slate-500", children: "\u041A\u043B\u0438\u0435\u043D\u0442\u044B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B" }) : null, totalDebt > 0 ? (_jsxs("div", { className: "mt-3 flex items-center justify-between rounded-xl border-2 border-red-300 bg-red-100 p-3", children: [_jsx("span", { className: "font-semibold text-red-900", children: "\u0418\u0442\u043E\u0433\u043E \u043F\u043E \u0434\u043E\u043B\u0436\u043D\u0438\u043A\u0430\u043C" }), _jsxs("span", { className: "text-xl font-bold text-red-700", children: [totalDebt.toFixed(2), " \u0441\u043E\u043C"] })] })) : null] })] }), selectedId !== null ? (_jsx(CustomerDetailsModal, { id: selectedId, onClose: () => setSelectedId(null) })) : null, showForm ? (_jsx("div", { className: "fixed inset-0 z-40 bg-black/40 p-4", children: _jsxs("div", { className: "mx-auto max-w-md rounded-2xl bg-white p-4", children: [_jsx("h2", { className: "mb-3 text-xl font-semibold", children: "\u041D\u043E\u0432\u044B\u0439 \u043A\u043B\u0438\u0435\u043D\u0442" }), _jsxs("div", { className: "space-y-3", children: [_jsx("input", { className: "w-full rounded-xl border p-3", placeholder: "\u0418\u043C\u044F", value: form.name, onChange: (e) => setForm((prev) => ({ ...prev, name: e.target.value })) }), _jsx("input", { className: "w-full rounded-xl border p-3", placeholder: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D", value: form.phone, onChange: (e) => setForm((prev) => ({ ...prev, phone: e.target.value })) }), _jsx("input", { className: "w-full rounded-xl border p-3", placeholder: "\u0410\u0434\u0440\u0435\u0441", value: form.address, onChange: (e) => setForm((prev) => ({ ...prev, address: e.target.value })) }), _jsx(NumberInput, { className: "w-full rounded-xl border p-3", placeholder: "\u0421\u043A\u0438\u0434\u043A\u0430 %", value: form.discount_percent, onChange: (value) => setForm((prev) => ({ ...prev, discount_percent: value })) })] }), _jsxs("div", { className: "mt-4 flex gap-2", children: [_jsx("button", { onClick: () => createMutation.mutate(), className: "flex-1 rounded-xl bg-primary p-3 text-white", children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C" }), _jsx("button", { className: "flex-1 rounded-xl border p-3", onClick: () => setShowForm(false), children: "\u041E\u0442\u043C\u0435\u043D\u0430" })] })] }) })) : null] }));
}
function CustomerDetailsModal({ id, onClose }) {
    const queryClient = useQueryClient();
    const [payAmount, setPayAmount] = useState("");
    const [payMethod, setPayMethod] = useState("cash");
    const [payComment, setPayComment] = useState("");
    const detailsQuery = useQuery({
        queryKey: ["customer-details", id],
        queryFn: async () => (await api.get(`/customers/${id}/details`)).data,
    });
    const historyQuery = useQuery({
        queryKey: ["customer-payments", id],
        queryFn: async () => (await api.get(`/customers/${id}/payment-history`)).data,
    });
    const data = detailsQuery.data;
    const payDebtMutation = useMutation({
        mutationFn: async () => api.post(`/customers/${id}/pay-debt`, {
            amount: Number(payAmount),
            method: payMethod,
            comment: payComment.trim() || null,
        }),
        onSuccess: async () => {
            setPayAmount("");
            setPayComment("");
            await queryClient.invalidateQueries({ queryKey: ["customer-details", id] });
            await queryClient.invalidateQueries({ queryKey: ["customer-payments", id] });
            await queryClient.invalidateQueries({ queryKey: ["customers"] });
        },
        onError: () => alert("Не удалось внести оплату"),
    });
    const setPromisedDateMutation = useMutation({
        mutationFn: async ({ saleId, date }) => {
            await api.put(`/sales/${saleId}/promised-date`, { date });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["customer-payments", id] });
        },
        onError: () => alert("Не удалось сохранить дату"),
    });
    const deleteMutation = useMutation({
        mutationFn: async () => api.delete(`/customers/${id}`),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["customers"] });
            onClose();
        },
        onError: (err) => {
            const msg = err?.response?.status === 403
                ? "Удалять клиентов может только владелец"
                : "Не удалось удалить клиента";
            alert(msg);
        },
    });
    const handleDelete = () => {
        if (!data)
            return;
        if (window.confirm(`Удалить клиента "${data.customer.name}"? Это действие нельзя отменить.`)) {
            deleteMutation.mutate();
        }
    };
    return (_jsx("div", { className: "fixed inset-0 z-40 bg-black/40 p-4", onClick: onClose, children: _jsxs("div", { className: "mx-auto max-h-[90dvh] max-w-md overflow-auto rounded-2xl bg-white p-4", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "mb-3 flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-semibold", children: data?.customer.name ?? "..." }), _jsx("p", { className: "text-slate-600", children: data?.customer.phone ?? "" })] }), _jsx("button", { className: "text-2xl text-slate-500", onClick: onClose, "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C", children: "\u00D7" })] }), detailsQuery.isLoading ? (_jsx("p", { className: "text-sm text-slate-500", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." })) : detailsQuery.isError ? (_jsx("p", { className: "text-sm text-red-600", children: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435" })) : data ? (_jsxs("div", { className: "space-y-4", children: [data.customer.address ? (_jsx(Section, { title: "\u0410\u0434\u0440\u0435\u0441", children: _jsx("p", { className: "text-sm", children: data.customer.address }) })) : null, Number(data.customer.discount_percent ?? 0) > 0 ? (_jsx(Section, { title: "\u0421\u043A\u0438\u0434\u043A\u0430", children: _jsxs("span", { className: "inline-block rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-700", children: [Number(data.customer.discount_percent).toFixed(0), "%"] }) })) : null, _jsx(Section, { title: "\u041F\u043E\u043A\u0443\u043F\u043A\u0438", children: _jsxs("div", { className: "grid grid-cols-2 gap-3 text-sm", children: [_jsxs("div", { className: "rounded-xl bg-slate-50 p-3", children: [_jsx("p", { className: "text-slate-500", children: "\u0412\u0441\u0435\u0433\u043E \u043F\u043E\u043A\u0443\u043F\u043E\u043A" }), _jsx("p", { className: "text-xl font-semibold", children: data.stats.purchases_count })] }), _jsxs("div", { className: "rounded-xl bg-slate-50 p-3", children: [_jsx("p", { className: "text-slate-500", children: "\u0421\u0443\u043C\u043C\u0430" }), _jsxs("p", { className: "text-xl font-semibold", children: [Number(data.stats.purchases_total).toFixed(2), " \u0441\u043E\u043C"] })] })] }) }), Number(data.stats.debt_amount) > 0 ? (_jsxs(Section, { title: "\u0414\u043E\u043B\u0433", children: [_jsxs("p", { className: "text-2xl font-bold text-red-600", children: [Number(data.stats.debt_amount).toFixed(2), " \u0441\u043E\u043C"] }), _jsxs("div", { className: "mt-3 space-y-2 rounded-xl border border-red-200 bg-red-50 p-3", children: [_jsx("p", { className: "text-sm font-medium text-red-900", children: "\u0412\u043D\u0435\u0441\u0442\u0438 \u043E\u043F\u043B\u0430\u0442\u0443 \u0434\u043E\u043B\u0433\u0430" }), _jsx(NumberInput, { value: payAmount, onChange: setPayAmount, placeholder: "\u0421\u0443\u043C\u043C\u0430", className: "h-11 w-full rounded-xl border px-3" }), _jsxs("select", { value: payMethod, onChange: (e) => setPayMethod(e.target.value), className: "h-11 w-full rounded-xl border bg-white px-3", children: [_jsx("option", { value: "cash", children: "\u041D\u0430\u043B\u0438\u0447\u043D\u044B\u043C\u0438" }), _jsx("option", { value: "card", children: "\u041A\u0430\u0440\u0442\u043E\u0439" }), _jsx("option", { value: "transfer", children: "\u041F\u0435\u0440\u0435\u0432\u043E\u0434\u043E\u043C" })] }), _jsx("input", { value: payComment, onChange: (e) => setPayComment(e.target.value), placeholder: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)", className: "h-11 w-full rounded-xl border px-3" }), _jsx("button", { type: "button", onClick: () => payDebtMutation.mutate(), disabled: !payAmount || Number(payAmount) <= 0 || payDebtMutation.isPending, className: "h-11 w-full rounded-xl bg-emerald-600 font-semibold text-white disabled:opacity-50", children: payDebtMutation.isPending ? "Сохранение..." : "Внести" })] })] })) : null, historyQuery.data && historyQuery.data.sales_with_debt && historyQuery.data.sales_with_debt.length > 0 ? (_jsxs(Section, { title: "\u0414\u043E\u043B\u0433\u043E\u0432\u044B\u0435 \u043F\u0440\u043E\u0434\u0430\u0436\u0438", children: [_jsx("div", { className: "space-y-2", children: historyQuery.data.sales_with_debt.map((sd) => {
                                        const today = new Date().toISOString().slice(0, 10);
                                        const isToday = sd.promised_payment_date === today;
                                        const isOverdue = !!sd.promised_payment_date && sd.promised_payment_date < today;
                                        return (_jsxs("div", { className: "rounded-xl border p-2 text-sm", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("span", { className: "font-semibold", children: ["#", sd.id, " \u00B7 ", sd.remaining_debt.toFixed(2), " \u0441\u043E\u043C"] }), _jsx("span", { className: "text-xs text-slate-500", children: sd.date ? new Date(sd.date).toLocaleDateString("ru-RU") : "—" })] }), _jsxs("div", { className: "mt-2 flex items-center gap-2", children: [_jsx("label", { className: "text-xs text-slate-500", children: "\u041E\u0431\u0435\u0449\u0430\u043B \u0432\u0435\u0440\u043D\u0443\u0442\u044C \u0434\u043E:" }), _jsx("input", { type: "date", value: sd.promised_payment_date ?? "", onChange: (e) => setPromisedDateMutation.mutate({
                                                                saleId: sd.id,
                                                                date: e.target.value || null,
                                                            }), className: `h-8 rounded-lg border px-2 text-xs ${isOverdue
                                                                ? "border-red-300 bg-red-50 text-red-700"
                                                                : isToday
                                                                    ? "border-amber-300 bg-amber-50 text-amber-700"
                                                                    : "border-slate-300"}` }), sd.promised_payment_date ? (_jsx("button", { type: "button", onClick: () => setPromisedDateMutation.mutate({ saleId: sd.id, date: null }), className: "text-xs text-slate-500 underline hover:text-slate-700", title: "\u0423\u0431\u0440\u0430\u0442\u044C \u0434\u0430\u0442\u0443", children: "\u0443\u0431\u0440\u0430\u0442\u044C" })) : null] }), isOverdue ? (_jsx("p", { className: "mt-1 text-xs font-medium text-red-700", children: "\u26A0 \u0421\u0440\u043E\u043A \u043F\u0440\u043E\u0448\u0451\u043B \u2014 \u043F\u043E\u0437\u0432\u043E\u043D\u0438\u0442\u044C!" })) : isToday ? (_jsx("p", { className: "mt-1 text-xs font-medium text-amber-700", children: "\uD83D\uDCDE \u0421\u0435\u0433\u043E\u0434\u043D\u044F \u043E\u0431\u0435\u0449\u0430\u043B \u2014 \u043F\u043E\u0437\u0432\u043E\u043D\u0438\u0442\u044C" })) : null] }, sd.id));
                                    }) }), _jsx("p", { className: "mt-2 text-xs text-slate-500", children: "\u041F\u043E\u0441\u0442\u0430\u0432\u044C \u0434\u0430\u0442\u0443 \u00AB\u043E\u0431\u0435\u0449\u0430\u043B \u0432\u0435\u0440\u043D\u0443\u0442\u044C \u0434\u043E\u00BB \u2014 \u0443\u0442\u0440\u043E\u043C \u043F\u043E\u043B\u0443\u0447\u0438\u0448\u044C push-\u043D\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u043D\u0438\u0435 \u043F\u043E\u0437\u0432\u043E\u043D\u0438\u0442\u044C." })] })) : null, historyQuery.data && historyQuery.data.payments.length > 0 ? (_jsxs(Section, { title: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043F\u043E\u0433\u0430\u0448\u0435\u043D\u0438\u0439", children: [_jsx("div", { className: "space-y-1", children: historyQuery.data.payments.map((p) => (_jsxs("div", { className: "rounded-xl border p-2 text-sm", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("span", { className: "font-semibold text-emerald-700", children: [p.amount.toFixed(2), " \u0441\u043E\u043C"] }), _jsx("span", { className: "text-xs text-slate-500", children: p.created_at ? new Date(p.created_at).toLocaleString("ru-RU") : "—" })] }), _jsxs("div", { className: "mt-1 text-xs text-slate-600", children: [METHOD_LABEL[p.method] ?? p.method, p.created_by ? ` · ${p.created_by}` : "", p.sale_id ? ` · к продаже #${p.sale_id}` : ""] }), p.comment ? _jsx("p", { className: "mt-1 text-xs text-slate-700", children: p.comment }) : null] }, p.id))) }), _jsxs("p", { className: "mt-2 text-xs text-slate-500", children: ["\u0412\u0441\u0435\u0433\u043E \u0432\u043D\u0435\u0441\u0435\u043D\u043E:", " ", _jsxs("b", { children: [historyQuery.data.payments
                                                    .reduce((acc, p) => acc + p.amount, 0)
                                                    .toFixed(2), " \u0441\u043E\u043C"] })] })] })) : null, _jsx(Section, { title: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043F\u043E\u043A\u0443\u043F\u043E\u043A", children: data.recent_purchases.length ? (_jsx("div", { className: "space-y-1", children: data.recent_purchases.map((p) => (_jsxs("div", { className: "flex items-center justify-between rounded-xl border p-2 text-sm", children: [_jsxs("div", { children: [_jsxs("p", { children: ["#", p.id] }), _jsx("p", { className: "text-xs text-slate-500", children: p.created_at.slice(0, 10) })] }), _jsxs("div", { className: "text-right", children: [_jsxs("p", { className: "font-semibold", children: [Number(p.total).toFixed(2), " \u0441\u043E\u043C"] }), _jsx("p", { className: "text-xs text-slate-500", children: SALE_STATUS_LABEL[p.status] ?? p.status })] })] }, p.id))) })) : (_jsx("p", { className: "text-sm text-slate-500", children: "\u041F\u043E\u043A\u0443\u043F\u043E\u043A \u0435\u0449\u0451 \u043D\u0435 \u0431\u044B\u043B\u043E" })) }), _jsx("button", { type: "button", onClick: handleDelete, disabled: deleteMutation.isPending, className: "mt-2 w-full rounded-xl border border-red-300 p-3 text-sm font-semibold text-red-600 disabled:opacity-50", children: deleteMutation.isPending ? "Удаление..." : "Удалить клиента" })] })) : null] }) }));
}
function Section({ title, children }) {
    return (_jsxs("div", { children: [_jsx("h3", { className: "mb-2 text-xs font-semibold uppercase text-slate-500", children: title }), children] }));
}
