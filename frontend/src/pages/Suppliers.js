import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";
import { useBusinessSettings } from "../hooks/useBusinessSettings";
const emptyForm = { id: null, name: "", contact: "", note: "" };
export function Suppliers() {
    const role = useAuthStore((s) => s.role);
    const { type: businessType } = useBusinessSettings();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");
    const [form, setForm] = useState(emptyForm);
    const [showForm, setShowForm] = useState(false);
    const isGrocery = businessType === "grocery";
    const isOwner = role === "owner";
    const suppliersQuery = useQuery({
        queryKey: ["suppliers"],
        queryFn: async () => (await api.get("/suppliers")).data,
    });
    const saveMutation = useMutation({
        mutationFn: async () => {
            const payload = {
                name: form.name.trim(),
                contact: form.contact.trim() || null,
                note: form.note.trim() || null,
            };
            if (form.id) {
                return (await api.patch(`/suppliers/${form.id}`, payload)).data;
            }
            return (await api.post("/suppliers", payload)).data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["suppliers"] });
            setForm(emptyForm);
            setShowForm(false);
        },
    });
    const deleteMutation = useMutation({
        mutationFn: async (id) => {
            await api.delete(`/suppliers/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["suppliers"] });
        },
    });
    const filtered = useMemo(() => {
        const list = suppliersQuery.data ?? [];
        if (!search.trim())
            return list;
        const q = search.trim().toLowerCase();
        return list.filter((s) => s.name.toLowerCase().includes(q) ||
            (s.contact ?? "").toLowerCase().includes(q) ||
            (s.note ?? "").toLowerCase().includes(q));
    }, [suppliersQuery.data, search]);
    // Если зашли в магазин не-grocery — отбрасываем (страница не для них).
    if (!isGrocery) {
        return _jsx(Navigate, { to: "/sale", replace: true });
    }
    return (_jsxs("div", { className: "mx-auto max-w-4xl", children: [_jsxs("div", { className: "mb-4 flex items-center justify-between gap-2", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-slate-800", children: "\u041F\u043E\u0441\u0442\u0430\u0432\u0449\u0438\u043A\u0438" }), _jsx("p", { className: "text-sm text-slate-500", children: "\u0427\u0430\u0441\u0442\u043E \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u043C\u044B\u0435 \u2014 \u0432\u044B\u0448\u0435. \u041F\u043E\u0438\u0441\u043A \u043F\u043E \u0438\u043C\u0435\u043D\u0438, \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0443 \u0438\u043B\u0438 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u044E." })] }), isOwner ? (_jsxs("button", { type: "button", onClick: () => {
                            setForm(emptyForm);
                            setShowForm(true);
                        }, className: "inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90", children: [_jsx(Plus, { size: 16 }), " \u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C"] })) : null] }), _jsxs("div", { className: "mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm", children: [_jsx(Search, { size: 16, className: "text-slate-400" }), _jsx("input", { type: "text", value: search, onChange: (e) => setSearch(e.target.value), placeholder: "\u041D\u0430\u0439\u0442\u0438 \u043F\u043E\u0441\u0442\u0430\u0432\u0449\u0438\u043A\u0430\u2026", className: "flex-1 bg-transparent text-sm focus:outline-none" })] }), showForm && isOwner ? (_jsxs("div", { className: "mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm", children: [_jsx("h2", { className: "mb-3 text-base font-semibold", children: form.id ? "Редактировать поставщика" : "Новый поставщик" }), _jsxs("div", { className: "grid gap-3 md:grid-cols-2", children: [_jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0418\u043C\u044F \u0430\u0433\u0435\u043D\u0442\u0430 \u0438\u043B\u0438 \u0444\u0438\u0440\u043C\u044B *" }), _jsx("input", { value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }), placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u0418\u041F \u0418\u0432\u0430\u043D\u043E\u0432 / \u041E\u0441\u041E\u041E \u0421\u0443\u0442", className: "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D" }), _jsx("input", { value: form.contact, onChange: (e) => setForm({ ...form, contact: e.target.value }), placeholder: "+996 700 000 000", className: "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" })] }), _jsxs("div", { className: "md:col-span-2", children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0427\u0442\u043E \u043F\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442 (\u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0434\u0443\u043A\u0446\u0438\u0438)" }), _jsx("textarea", { value: form.note, onChange: (e) => setForm({ ...form, note: e.target.value }), placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u043C\u043E\u043B\u043E\u0447\u043A\u0430, \u0445\u043B\u0435\u0431, \u043E\u0432\u043E\u0449\u0438", rows: 2, className: "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" })] })] }), _jsxs("div", { className: "mt-3 flex gap-2", children: [_jsx("button", { type: "button", onClick: () => saveMutation.mutate(), disabled: !form.name.trim() || saveMutation.isPending, className: "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50", children: saveMutation.isPending ? "Сохраняю…" : "Сохранить" }), _jsx("button", { type: "button", onClick: () => {
                                    setForm(emptyForm);
                                    setShowForm(false);
                                }, className: "rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50", children: "\u041E\u0442\u043C\u0435\u043D\u0430" })] })] })) : null, suppliersQuery.isLoading ? (_jsx("p", { className: "text-sm text-slate-500", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" })) : filtered.length === 0 ? (_jsx("div", { className: "rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500", children: search ? "Ничего не найдено" : "Поставщиков пока нет. Нажми «Добавить» или они появятся автоматически после первого прихода." })) : (_jsx("div", { className: "grid gap-3 md:grid-cols-2", children: filtered.map((s) => (_jsxs("div", { className: "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm", children: [_jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsxs("div", { className: "flex items-start gap-2", children: [_jsx("div", { className: "rounded-lg bg-indigo-50 p-2 text-primary", children: _jsx(Building2, { size: 18 }) }), _jsxs("div", { children: [_jsx("h3", { className: "text-base font-semibold text-slate-800", children: s.name }), _jsxs("p", { className: "text-xs text-slate-500", children: ["\u0418\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D \u0432 \u043F\u0440\u0438\u0445\u043E\u0434\u0430\u0445: ", _jsx("span", { className: "font-semibold text-slate-700", children: s.usage_count })] })] })] }), isOwner ? (_jsxs("div", { className: "flex gap-1", children: [_jsx("button", { type: "button", onClick: () => {
                                                setForm({
                                                    id: s.id,
                                                    name: s.name,
                                                    contact: s.contact ?? "",
                                                    note: s.note ?? "",
                                                });
                                                setShowForm(true);
                                            }, className: "rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50", title: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C", children: _jsx(Pencil, { size: 14 }) }), _jsx("button", { type: "button", onClick: () => {
                                                if (confirm(`Удалить поставщика «${s.name}»?`)) {
                                                    deleteMutation.mutate(s.id);
                                                }
                                            }, className: "rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600", title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C", children: _jsx(Trash2, { size: 14 }) })] })) : null] }), s.contact ? (_jsxs("p", { className: "mt-3 flex items-center gap-1.5 text-sm text-slate-700", children: [_jsx(Phone, { size: 14, className: "text-slate-400" }), _jsx("a", { href: `tel:${s.contact}`, className: "hover:text-primary", children: s.contact })] })) : null, s.note ? (_jsx("p", { className: "mt-2 text-sm text-slate-600", children: s.note })) : null] }, s.id))) }))] }));
}
