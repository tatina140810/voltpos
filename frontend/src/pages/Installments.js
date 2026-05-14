import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NumberInput } from "../components/NumberInput";
import { api } from "../lib/api";
export function InstallmentsPage() {
    const [selectedId, setSelectedId] = useState(null);
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState("cash");
    const queryClient = useQueryClient();
    const installmentsQuery = useQuery({
        queryKey: ["installments"],
        queryFn: async () => (await api.get("/installments")).data,
    });
    const paymentMutation = useMutation({
        mutationFn: async () => {
            if (!selectedId)
                return;
            await api.post(`/installments/${selectedId}/payment`, {
                amount: Number(amount),
                payment_method: method,
                paid_at: new Date().toISOString(),
            });
        },
        onSuccess: async () => {
            setSelectedId(null);
            setAmount("0");
            setMethod("cash");
            await queryClient.invalidateQueries({ queryKey: ["installments"] });
        },
    });
    const items = installmentsQuery.data ?? [];
    return (_jsxs("main", { children: [_jsx("h1", { className: "mb-4 text-3xl font-semibold", children: "\u0420\u0430\u0441\u0441\u0440\u043E\u0447\u043A\u0438 \u0438 \u0434\u043E\u043B\u0433\u0438" }), _jsx("div", { className: "rounded-2xl bg-white p-4 shadow", children: _jsxs("div", { className: "space-y-2", children: [items.map((item) => {
                            const debt = Number(item.total_amount) - Number(item.paid_amount);
                            const overdue = item.status === "overdue";
                            return (_jsx("div", { className: `rounded-xl border p-3 ${overdue ? "bg-red-50" : ""}`, children: _jsxs("div", { className: "flex flex-col gap-3 md:flex-row md:items-center md:justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "font-semibold", children: item.customer_name ?? `Клиент #${item.customer_id}` }), _jsxs("p", { className: "text-sm text-slate-600", children: ["\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0439 \u043F\u043B\u0430\u0442\u0451\u0436: ", item.next_payment_date] }), _jsxs("p", { className: "text-sm text-slate-600", children: ["\u0421\u0442\u0430\u0442\u0443\u0441: ", item.status] })] }), _jsxs("div", { className: "text-sm md:text-right", children: [_jsxs("p", { children: ["\u0414\u043E\u043B\u0433: ", debt.toFixed(2), " \u0441\u043E\u043C"] }), _jsxs("p", { children: ["\u0412\u044B\u043F\u043B\u0430\u0447\u0435\u043D\u043E: ", Number(item.paid_amount).toFixed(2), " \u0441\u043E\u043C"] }), _jsx("button", { className: "mt-2 rounded-lg bg-primary px-3 py-2 text-white", onClick: () => setSelectedId(item.id), children: "\u0412\u043D\u0435\u0441\u0442\u0438 \u043F\u043B\u0430\u0442\u0451\u0436" })] })] }) }, item.id));
                        }), !items.length ? _jsx("p", { className: "text-sm text-slate-500", children: "\u0420\u0430\u0441\u0441\u0440\u043E\u0447\u043A\u0438 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B" }) : null] }) }), selectedId ? (_jsx("div", { className: "fixed inset-0 z-40 bg-black/40 p-4", children: _jsxs("div", { className: "mx-auto max-w-md rounded-2xl bg-white p-4", children: [_jsx("h2", { className: "mb-3 text-xl font-semibold", children: "\u0412\u043D\u0435\u0441\u0442\u0438 \u043F\u043B\u0430\u0442\u0451\u0436" }), _jsxs("div", { className: "space-y-3", children: [_jsx(NumberInput, { className: "w-full rounded-xl border p-3", value: amount, onChange: setAmount, placeholder: "\u0421\u0443\u043C\u043C\u0430" }), _jsxs("select", { value: method, onChange: (e) => setMethod(e.target.value), className: "w-full rounded-xl border p-3", children: [_jsx("option", { value: "cash", children: "\u041D\u0430\u043B\u0438\u0447\u043D\u044B\u0435" }), _jsx("option", { value: "card", children: "\u041A\u0430\u0440\u0442\u0430" }), _jsx("option", { value: "transfer", children: "\u041F\u0435\u0440\u0435\u0432\u043E\u0434" })] })] }), _jsxs("div", { className: "mt-4 flex gap-2", children: [_jsx("button", { className: "flex-1 rounded-xl bg-primary p-3 text-white", onClick: () => paymentMutation.mutate(), children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C" }), _jsx("button", { className: "flex-1 rounded-xl border p-3", onClick: () => setSelectedId(null), children: "\u041E\u0442\u043C\u0435\u043D\u0430" })] })] }) })) : null] }));
}
