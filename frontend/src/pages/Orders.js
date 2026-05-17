import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Wallet, Check, X } from "lucide-react";
import { NumberInput } from "../components/NumberInput";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";
const METHOD_LABEL = {
    cash: "💵 Наличными",
    card: "💳 Картой",
    transfer: "📱 Переводом",
};
function fmt(v) {
    if (v === null || v === undefined)
        return "—";
    return Number(v || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso) {
    if (!iso)
        return "—";
    return new Date(iso).toLocaleString("ru-RU", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
}
export function OrdersPage() {
    const role = useAuthStore((s) => s.role);
    const qc = useQueryClient();
    const [tab, setTab] = useState("open");
    const [showCreate, setShowCreate] = useState(false);
    const [activeOrder, setActiveOrder] = useState(null);
    const [actionMode, setActionMode] = useState(null);
    const ordersQuery = useQuery({
        queryKey: ["orders", tab],
        queryFn: async () => (await api.get(`/orders?status=${tab}`)).data,
    });
    const orders = ordersQuery.data ?? [];
    return (_jsxs("main", { className: "mx-auto max-w-5xl", children: [_jsxs("div", { className: "mb-4 flex items-center justify-between gap-2", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-slate-800", children: "\uD83D\uDCE6 \u0417\u0430\u043A\u0430\u0437\u044B \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u0432" }), _jsx("p", { className: "text-sm text-slate-500", children: "\u041F\u0440\u0435\u0434\u043E\u043F\u043B\u0430\u0442\u0430 \u0437\u0430 \u0442\u043E\u0432\u0430\u0440, \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u043F\u0440\u0438\u0432\u0435\u0437\u0443\u0442 \u043F\u043E\u0437\u0436\u0435. \u0412\u044B\u0434\u0430\u0447\u0430 = \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u0435 \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0439 \u043F\u0440\u043E\u0434\u0430\u0436\u0438." })] }), _jsxs("button", { type: "button", onClick: () => setShowCreate(true), className: "inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90", children: [_jsx(Plus, { size: 16 }), " \u041F\u0440\u0438\u043D\u044F\u0442\u044C \u043F\u0440\u0435\u0434\u043E\u043F\u043B\u0430\u0442\u0443"] })] }), _jsx("div", { className: "mb-3 flex gap-2 border-b", children: ["open", "fulfilled", "cancelled"].map((t) => (_jsx("button", { type: "button", onClick: () => setTab(t), className: `px-4 py-2 text-sm ${tab === t
                        ? "border-b-2 border-primary font-semibold text-primary"
                        : "text-slate-500 hover:text-slate-800"}`, children: t === "open" ? "🕓 Открытые" : t === "fulfilled" ? "✅ Выданные" : "❌ Отменённые" }, t))) }), ordersQuery.isLoading ? (_jsx("p", { className: "text-sm text-slate-500", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" })) : orders.length === 0 ? (_jsx("div", { className: "rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500", children: tab === "open" ? "Нет открытых заказов." : tab === "fulfilled" ? "Нет выданных." : "Нет отменённых." })) : (_jsx("div", { className: "space-y-3", children: orders.map((o) => (_jsxs("div", { className: "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm", children: [_jsxs("div", { className: "mb-2 flex flex-wrap items-start justify-between gap-2", children: [_jsxs("div", { children: [_jsxs("p", { className: "text-base font-semibold text-slate-800", children: ["#", o.id, " \u00B7 ", o.title] }), _jsxs("p", { className: "text-xs text-slate-500", children: ["\u041A\u043B\u0438\u0435\u043D\u0442: ", _jsx("b", { children: o.customer_name ?? "—" }), " \u00B7 \u0441\u043E\u0437\u0434\u0430\u043D ", fmtDate(o.created_at)] }), o.notes ? _jsxs("p", { className: "mt-1 text-xs text-slate-600", children: ["\uD83D\uDCDD ", o.notes] }) : null] }), _jsxs("div", { className: "text-right", children: [_jsxs("p", { className: "text-sm text-slate-500", children: ["\u0412\u043D\u0435\u0441\u0435\u043D\u043E: ", _jsxs("b", { children: [fmt(o.paid_total), " \u0441\u043E\u043C"] })] }), o.total_expected ? (_jsxs("p", { className: "text-xs text-slate-500", children: ["\u041E\u0436\u0438\u0434\u0430\u0435\u043C: ", fmt(o.total_expected), " \u00B7 \u043E\u0441\u0442\u0430\u0442\u043E\u043A ", _jsx("b", { children: fmt(o.remaining) })] })) : null] })] }), _jsxs("p", { className: "text-xs text-slate-500", children: ["\u043D\u0430\u043B ", fmt(o.paid_cash), " \u00B7 \u043A\u0430\u0440\u0442\u0430 ", fmt(o.paid_card), " \u00B7 \u043F\u0435\u0440\u0435\u0432\u043E\u0434 ", fmt(o.paid_transfer)] }), o.sale_id ? (_jsxs("p", { className: "mt-1 text-xs text-emerald-700", children: ["\u2705 \u0421\u043E\u0437\u0434\u0430\u043D\u0430 \u043F\u0440\u043E\u0434\u0430\u0436\u0430 #", o.sale_id] })) : null, o.status === "open" ? (_jsxs("div", { className: "mt-3 flex flex-wrap gap-2", children: [_jsxs("button", { type: "button", onClick: () => { setActiveOrder(o); setActionMode("add_payment"); }, className: "inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1 text-xs hover:border-primary hover:text-primary", children: [_jsx(Wallet, { size: 14 }), " \u0412\u043D\u0435\u0441\u0442\u0438 \u0435\u0449\u0451"] }), _jsxs("button", { type: "button", onClick: () => { setActiveOrder(o); setActionMode("fulfill"); }, className: "inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700", children: [_jsx(Check, { size: 14 }), " \u0412\u044B\u0434\u0430\u0442\u044C \u0442\u043E\u0432\u0430\u0440"] }), role === "owner" ? (_jsxs("button", { type: "button", onClick: async () => {
                                        if (!window.confirm("Отменить заказ? Предоплата вернётся клиенту."))
                                            return;
                                        try {
                                            await api.post(`/orders/${o.id}/cancel`, {});
                                            qc.invalidateQueries({ queryKey: ["orders"] });
                                        }
                                        catch (err) {
                                            alert("Не удалось отменить");
                                        }
                                    }, className: "inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50", children: [_jsx(X, { size: 14 }), " \u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C"] })) : null] })) : null] }, o.id))) })), showCreate ? (_jsx(CreateOrderModal, { onClose: () => setShowCreate(false), onCreated: () => qc.invalidateQueries({ queryKey: ["orders"] }) })) : null, activeOrder && actionMode === "add_payment" ? (_jsx(AddPaymentModal, { order: activeOrder, onClose: () => { setActiveOrder(null); setActionMode(null); }, onSaved: () => qc.invalidateQueries({ queryKey: ["orders"] }) })) : null, activeOrder && actionMode === "fulfill" ? (_jsx(FulfillModal, { order: activeOrder, onClose: () => { setActiveOrder(null); setActionMode(null); }, onDone: () => {
                    qc.invalidateQueries({ queryKey: ["orders"] });
                    qc.invalidateQueries({ queryKey: ["stock-summary"] });
                } })) : null] }));
}
// ============= Создание заказа =============
function CreateOrderModal({ onClose, onCreated }) {
    const [customerSearch, setCustomerSearch] = useState("");
    const [customerId, setCustomerId] = useState(null);
    const [title, setTitle] = useState("");
    const [notes, setNotes] = useState("");
    const [totalExpected, setTotalExpected] = useState("");
    const [firstAmount, setFirstAmount] = useState("");
    const [firstMethod, setFirstMethod] = useState("cash");
    const customersQuery = useQuery({
        queryKey: ["customers"],
        queryFn: async () => (await api.get("/customers")).data,
    });
    const customers = customersQuery.data ?? [];
    const filtered = useMemo(() => {
        if (!customerSearch.trim())
            return customers.slice(0, 5);
        const q = customerSearch.trim().toLowerCase();
        return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)).slice(0, 10);
    }, [customers, customerSearch]);
    const createMutation = useMutation({
        mutationFn: async () => {
            const payload = {
                customer_id: customerId,
                title: title.trim(),
                notes: notes.trim() || null,
                total_expected: totalExpected ? Number(String(totalExpected).replace(",", ".")) : null,
            };
            const amt = Number(String(firstAmount).replace(",", "."));
            if (amt > 0) {
                payload.first_payment = { amount: amt, method: firstMethod };
            }
            await api.post("/orders", payload);
        },
        onSuccess: () => {
            onCreated();
            onClose();
        },
        onError: (err) => {
            const detail = err.response?.data?.detail;
            alert(detail ?? "Не удалось создать заказ");
        },
    });
    const canSubmit = customerId !== null && title.trim().length > 0 && !createMutation.isPending;
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-auto", onClick: onClose, children: _jsxs("div", { className: "mt-8 w-full max-w-md rounded-2xl bg-white p-4 shadow-xl", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { className: "mb-3 text-lg font-semibold", children: "\u041F\u0440\u0438\u043D\u044F\u0442\u044C \u043F\u0440\u0435\u0434\u043E\u043F\u043B\u0430\u0442\u0443" }), _jsxs("div", { className: "space-y-3 text-sm", children: [_jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u041A\u043B\u0438\u0435\u043D\u0442 *" }), _jsx("input", { type: "text", value: customerSearch, onChange: (e) => { setCustomerSearch(e.target.value); setCustomerId(null); }, placeholder: "\u041F\u043E\u0438\u0441\u043A \u043F\u043E \u0438\u043C\u0435\u043D\u0438 \u0438\u043B\u0438 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0443\u2026", className: "h-11 w-full rounded-xl border border-slate-300 px-3" }), !customerId && filtered.length > 0 ? (_jsx("div", { className: "mt-1 max-h-40 overflow-y-auto rounded-xl border", children: filtered.map((c) => (_jsxs("button", { type: "button", onClick: () => { setCustomerId(c.id); setCustomerSearch(c.name); }, className: "block w-full border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50", children: [_jsx("span", { className: "font-semibold", children: c.name }), " ", _jsx("span", { className: "text-xs text-slate-500", children: c.phone })] }, c.id))) })) : null, customerId ? (_jsxs("p", { className: "mt-1 text-xs text-emerald-700", children: ["\u2713 \u0432\u044B\u0431\u0440\u0430\u043D \u043A\u043B\u0438\u0435\u043D\u0442 #", customerId] })) : null] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0427\u0442\u043E \u0437\u0430\u043A\u0430\u0437\u0430\u043B\u0438 *" }), _jsx("input", { type: "text", value: title, onChange: (e) => setTitle(e.target.value), placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u0425\u043E\u043B\u043E\u0434\u0438\u043B\u044C\u043D\u0438\u043A Samsung RB37", className: "h-11 w-full rounded-xl border border-slate-300 px-3" })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)" }), _jsx("input", { type: "text", value: notes, onChange: (e) => setNotes(e.target.value), placeholder: "\u0426\u0432\u0435\u0442, \u0440\u0430\u0437\u043C\u0435\u0440, \u0441\u0440\u043E\u043A \u043F\u043E\u0441\u0442\u0430\u0432\u043A\u0438\u2026", className: "h-11 w-full rounded-xl border border-slate-300 px-3" })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u041E\u0436\u0438\u0434\u0430\u0435\u043C\u0430\u044F \u043F\u043E\u043B\u043D\u0430\u044F \u0441\u0443\u043C\u043C\u0430 (\u0435\u0441\u043B\u0438 \u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430)" }), _jsx(NumberInput, { value: totalExpected, onChange: setTotalExpected, placeholder: "0", className: "h-11 w-full rounded-xl border border-slate-300 px-3" })] }), _jsxs("div", { className: "rounded-xl border border-emerald-200 bg-emerald-50 p-3", children: [_jsx("p", { className: "mb-2 text-xs font-semibold text-emerald-800", children: "\u041F\u0435\u0440\u0432\u0430\u044F \u043F\u0440\u0435\u0434\u043E\u043F\u043B\u0430\u0442\u0430 (\u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E)" }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(NumberInput, { value: firstAmount, onChange: setFirstAmount, placeholder: "\u0421\u0443\u043C\u043C\u0430", className: "h-10 w-full rounded-lg border border-slate-300 px-3" }), _jsx("select", { value: firstMethod, onChange: (e) => setFirstMethod(e.target.value), className: "h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm", children: Object.entries(METHOD_LABEL).map(([v, l]) => (_jsx("option", { value: v, children: l }, v))) })] })] })] }), _jsxs("div", { className: "mt-4 flex gap-2", children: [_jsx("button", { type: "button", onClick: () => createMutation.mutate(), disabled: !canSubmit, className: "flex-1 rounded-xl bg-primary p-3 text-sm font-semibold text-white disabled:opacity-50", children: createMutation.isPending ? "Создаю…" : "Создать заказ" }), _jsx("button", { type: "button", onClick: onClose, className: "rounded-xl border px-4 py-3 text-sm", children: "\u041E\u0442\u043C\u0435\u043D\u0430" })] })] }) }));
}
// ============= Добавить платёж =============
function AddPaymentModal({ order, onClose, onSaved }) {
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState("cash");
    const mut = useMutation({
        mutationFn: async () => {
            await api.post(`/orders/${order.id}/payments`, {
                amount: Number(String(amount).replace(",", ".")) || 0,
                method,
            });
        },
        onSuccess: () => { onSaved(); onClose(); },
        onError: (err) => {
            const detail = err.response?.data?.detail;
            alert(detail ?? "Не удалось");
        },
    });
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4", onClick: onClose, children: _jsxs("div", { className: "w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl", onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { className: "mb-3 text-lg font-semibold", children: "\u0412\u043D\u0435\u0441\u0442\u0438 \u043F\u0440\u0435\u0434\u043E\u043F\u043B\u0430\u0442\u0443" }), _jsxs("p", { className: "mb-3 text-sm text-slate-600", children: ["\u0417\u0430\u043A\u0430\u0437 ", _jsxs("b", { children: ["#", order.id, " ", order.title] }), _jsx("br", {}), "\u0423\u0436\u0435 \u0432\u043D\u0435\u0441\u0435\u043D\u043E: ", _jsxs("b", { children: [fmt(order.paid_total), " \u0441\u043E\u043C"] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(NumberInput, { value: amount, onChange: setAmount, placeholder: "\u0421\u0443\u043C\u043C\u0430", className: "h-11 w-full rounded-xl border px-3" }), _jsx("select", { value: method, onChange: (e) => setMethod(e.target.value), className: "h-11 w-full rounded-xl border bg-white px-3 text-sm", children: Object.entries(METHOD_LABEL).map(([v, l]) => (_jsx("option", { value: v, children: l }, v))) })] }), _jsxs("div", { className: "mt-4 flex gap-2", children: [_jsx("button", { type: "button", onClick: () => mut.mutate(), disabled: !amount || mut.isPending, className: "flex-1 rounded-xl bg-emerald-600 p-3 text-sm font-semibold text-white disabled:opacity-50", children: mut.isPending ? "Сохраняю…" : "Внести" }), _jsx("button", { type: "button", onClick: onClose, className: "rounded-xl border px-4 py-3 text-sm", children: "\u041E\u0442\u043C\u0435\u043D\u0430" })] })] }) }));
}
function FulfillModal({ order, onClose, onDone }) {
    const [rows, setRows] = useState([]);
    const [search, setSearch] = useState("");
    const [extraCash, setExtraCash] = useState("");
    const [extraCard, setExtraCard] = useState("");
    const [extraTransfer, setExtraTransfer] = useState("");
    const productsQuery = useQuery({
        queryKey: ["products-all"],
        queryFn: async () => (await api.get("/products")).data,
    });
    const products = productsQuery.data ?? [];
    const filtered = useMemo(() => {
        if (!search.trim())
            return [];
        const q = search.trim().toLowerCase();
        return products.filter((p) => p.name.toLowerCase().includes(q) || (p.barcode || "").includes(q)).slice(0, 8);
    }, [products, search]);
    const itemsTotal = rows.reduce((acc, r) => acc + (Number(r.quantity) || 0) * (Number(String(r.price).replace(",", ".")) || 0), 0);
    const prepaidTotal = Number(order.paid_total) || 0;
    const extraTotal = (Number(extraCash) || 0) + (Number(extraCard) || 0) + (Number(extraTransfer) || 0);
    const remaining = Math.max(0, itemsTotal - prepaidTotal);
    const enough = prepaidTotal + extraTotal >= itemsTotal && rows.length > 0;
    const mut = useMutation({
        mutationFn: async () => {
            await api.post(`/orders/${order.id}/fulfill`, {
                items: rows.map((r) => ({
                    product_id: r.product_id,
                    quantity: Math.max(1, Math.floor(Number(r.quantity) || 0)),
                    price: Number(String(r.price).replace(",", ".")) || 0,
                })),
                extra_cash: Number(extraCash) || 0,
                extra_card: Number(extraCard) || 0,
                extra_transfer: Number(extraTransfer) || 0,
            });
        },
        onSuccess: () => { onDone(); onClose(); alert("✅ Заказ выдан, продажа создана"); },
        onError: (err) => {
            const detail = err.response?.data?.detail;
            alert(detail ?? "Не удалось выдать");
        },
    });
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-auto", onClick: onClose, children: _jsxs("div", { className: "mt-4 w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl", onClick: (e) => e.stopPropagation(), children: [_jsxs("h3", { className: "mb-2 text-lg font-semibold", children: ["\u0412\u044B\u0434\u0430\u0442\u044C \u0437\u0430\u043A\u0430\u0437 #", order.id] }), _jsxs("p", { className: "mb-3 text-sm text-slate-600", children: [order.title, " \u00B7 ", order.customer_name] }), _jsxs("div", { className: "mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3", children: [_jsx("input", { type: "text", value: search, onChange: (e) => setSearch(e.target.value), placeholder: "\u041D\u0430\u0439\u0442\u0438 \u0442\u043E\u0432\u0430\u0440 \u043F\u043E \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044E \u0438\u043B\u0438 \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434\u0443\u2026", className: "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" }), filtered.length > 0 ? (_jsx("div", { className: "mt-2 max-h-40 overflow-y-auto rounded border bg-white", children: filtered.map((p) => (_jsxs("button", { type: "button", onClick: () => {
                                    setRows((prev) => [
                                        ...prev,
                                        {
                                            product_id: p.id,
                                            product_name: p.name,
                                            barcode: p.barcode,
                                            quantity: "1",
                                            price: String(p.sale_price ?? 0),
                                        },
                                    ]);
                                    setSearch("");
                                }, className: "block w-full border-b px-3 py-2 text-left text-xs last:border-b-0 hover:bg-slate-50", children: [_jsx("span", { className: "font-medium", children: p.name }), " ", _jsxs("span", { className: "text-slate-500", children: [p.barcode ?? "", " \u00B7 ", fmt(p.sale_price ?? 0), " \u0441\u043E\u043C"] })] }, p.id))) })) : null] }), rows.length === 0 ? (_jsx("p", { className: "text-sm text-slate-500", children: "\u0414\u043E\u0431\u0430\u0432\u044C \u0442\u043E\u0432\u0430\u0440\u044B \u0438\u0437 \u0431\u0430\u0437\u044B." })) : (_jsxs("table", { className: "w-full text-xs", children: [_jsx("thead", { className: "bg-slate-50 text-left", children: _jsxs("tr", { children: [_jsx("th", { className: "px-1 py-1", children: "\u0422\u043E\u0432\u0430\u0440" }), _jsx("th", { className: "px-1 py-1", children: "\u041A\u043E\u043B-\u0432\u043E" }), _jsx("th", { className: "px-1 py-1", children: "\u0426\u0435\u043D\u0430" }), _jsx("th", { className: "px-1 py-1", children: "\u0421\u0443\u043C\u043C\u0430" }), _jsx("th", {})] }) }), _jsx("tbody", { children: rows.map((r, idx) => (_jsxs("tr", { className: "border-t", children: [_jsx("td", { className: "px-1 py-1", children: r.product_name }), _jsx("td", { className: "px-1 py-1", children: _jsx("input", { type: "text", inputMode: "numeric", value: r.quantity, onChange: (e) => setRows((prev) => prev.map((p, i) => i === idx ? { ...p, quantity: e.target.value } : p)), className: "h-7 w-14 rounded border px-1 text-right" }) }), _jsx("td", { className: "px-1 py-1", children: _jsx("input", { type: "text", inputMode: "decimal", value: r.price, onChange: (e) => setRows((prev) => prev.map((p, i) => i === idx ? { ...p, price: e.target.value } : p)), className: "h-7 w-20 rounded border px-1 text-right" }) }), _jsx("td", { className: "px-1 py-1 text-right font-semibold tabular-nums", children: fmt((Number(r.quantity) || 0) * (Number(String(r.price).replace(",", ".")) || 0)) }), _jsx("td", { className: "px-1 py-1", children: _jsx("button", { onClick: () => setRows((prev) => prev.filter((_, i) => i !== idx)), className: "text-red-600", children: _jsx(Trash2, { size: 14 }) }) })] }, idx))) })] })), _jsxs("div", { className: "mt-3 space-y-1 rounded-xl border bg-slate-50 p-3 text-sm", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "\u0421\u0443\u043C\u043C\u0430 \u0442\u043E\u0432\u0430\u0440\u043E\u0432:" }), " ", _jsxs("b", { children: [fmt(itemsTotal), " \u0441\u043E\u043C"] })] }), _jsxs("div", { className: "flex justify-between text-emerald-700", children: [_jsx("span", { children: "\u041F\u0440\u0435\u0434\u043E\u043F\u043B\u0430\u0442\u0430:" }), " ", _jsxs("b", { children: ["\u2212", fmt(prepaidTotal), " \u0441\u043E\u043C"] })] }), _jsxs("div", { className: "flex justify-between font-semibold", children: [_jsx("span", { children: "\u041A \u0434\u043E\u043F\u043B\u0430\u0442\u0435:" }), " ", _jsxs("b", { children: [fmt(remaining), " \u0441\u043E\u043C"] })] })] }), _jsxs("div", { className: "mt-3 grid grid-cols-3 gap-2 text-xs", children: [_jsxs("label", { children: [_jsx("span", { className: "block text-slate-500", children: "\u041D\u0430\u043B" }), _jsx(NumberInput, { value: extraCash, onChange: setExtraCash, placeholder: "0", className: "h-9 w-full rounded border px-2 text-right" })] }), _jsxs("label", { children: [_jsx("span", { className: "block text-slate-500", children: "\u041A\u0430\u0440\u0442\u0430" }), _jsx(NumberInput, { value: extraCard, onChange: setExtraCard, placeholder: "0", className: "h-9 w-full rounded border px-2 text-right" })] }), _jsxs("label", { children: [_jsx("span", { className: "block text-slate-500", children: "\u041F\u0435\u0440\u0435\u0432\u043E\u0434" }), _jsx(NumberInput, { value: extraTransfer, onChange: setExtraTransfer, placeholder: "0", className: "h-9 w-full rounded border px-2 text-right" })] })] }), _jsxs("div", { className: "mt-4 flex gap-2", children: [_jsx("button", { type: "button", onClick: () => mut.mutate(), disabled: !enough || mut.isPending, className: "flex-1 rounded-xl bg-emerald-600 p-3 text-sm font-semibold text-white disabled:opacity-50", children: mut.isPending ? "Создаю продажу…" : "Завершить и выдать" }), _jsx("button", { type: "button", onClick: onClose, className: "rounded-xl border px-4 py-3 text-sm", children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })] })] }) }));
}
