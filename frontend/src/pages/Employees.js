import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, UserCog } from "lucide-react";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";
import { useBusinessSettings } from "../hooks/useBusinessSettings";
// Все потенциальные разделы доступа, которые можно дать/отобрать.
// Если в магазине нет grocery — «Поставщики» всё равно показываем, но в реальности
// меню не появится (фильтр по business_type в Layout).
const ACCESS_SECTIONS = [
    { path: "/sale", label: "Касса" },
    { path: "/stock", label: "Склад", hint: "приходы, остатки, ревизии" },
    { path: "/suppliers", label: "Поставщики", hint: "только для продуктового магазина" },
    { path: "/products", label: "Товары" },
    { path: "/customers", label: "Клиенты" },
    { path: "/deliveries", label: "Доставки" },
    { path: "/cash-withdrawals", label: "Инкассация" },
    { path: "/reports", label: "Отчёты" },
];
// Дефолтный набор доступов по роли (как в Layout.tsx) — нужен чтобы показать
// «исходное состояние» когда у юзера ещё нет overrides.
const DEFAULT_ACCESS = {
    seller: new Set(["/sale", "/customers", "/deliveries", "/cash-withdrawals"]),
    warehouse: new Set(["/stock", "/products", "/suppliers"]),
    owner: new Set(ACCESS_SECTIONS.map((s) => s.path)), // owner видит всё
};
function isAllowed(emp, path) {
    if (emp.menu_overrides && Object.prototype.hasOwnProperty.call(emp.menu_overrides, path)) {
        return emp.menu_overrides[path] === true;
    }
    return DEFAULT_ACCESS[emp.role]?.has(path) ?? false;
}
export function EmployeesPage() {
    const role = useAuthStore((s) => s.role);
    if (role !== "owner") {
        return _jsx(Navigate, { to: "/sale", replace: true });
    }
    return _jsx(EmployeesInner, {});
}
function EmployeesInner() {
    const queryClient = useQueryClient();
    const { type: businessType } = useBusinessSettings();
    const isGrocery = businessType === "grocery";
    const employeesQuery = useQuery({
        queryKey: ["employees"],
        queryFn: async () => (await api.get("/org/me/users")).data,
    });
    // Локальные «черновые» доступы, чтобы юзер мог покликать чекбоксы и нажать
    // «Сохранить» для конкретного сотрудника.
    const [drafts, setDrafts] = useState({});
    // Когда подгрузится список — инициализируем черновики из текущих overrides + дефолтов по роли.
    useEffect(() => {
        if (!employeesQuery.data)
            return;
        const initial = {};
        for (const emp of employeesQuery.data) {
            const map = {};
            for (const section of ACCESS_SECTIONS) {
                map[section.path] = isAllowed(emp, section.path);
            }
            initial[emp.id] = map;
        }
        setDrafts(initial);
    }, [employeesQuery.data]);
    const saveMutation = useMutation({
        mutationFn: async ({ id, overrides }) => {
            await api.put(`/org/users/${id}/menu`, { menu_overrides: overrides });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["employees"] });
            queryClient.invalidateQueries({ queryKey: ["auth-me"] });
        },
    });
    const visibleSections = useMemo(() => ACCESS_SECTIONS.filter((s) => s.path !== "/suppliers" || isGrocery), [isGrocery]);
    const toggle = (empId, path) => {
        setDrafts((prev) => ({
            ...prev,
            [empId]: { ...(prev[empId] ?? {}), [path]: !(prev[empId]?.[path] ?? false) },
        }));
    };
    // Только сотрудники, которым доступы вообще имеют смысл — не сам владелец и не deleted.
    const employees = (employeesQuery.data ?? []).filter((e) => e.role !== "owner");
    return (_jsxs("div", { className: "mx-auto max-w-5xl", children: [_jsxs("div", { className: "mb-4 flex items-center gap-2", children: [_jsx(UserCog, { size: 22, className: "text-primary" }), _jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-slate-800", children: "\u0414\u043E\u0441\u0442\u0443\u043F\u044B \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u0432" }), _jsx("p", { className: "text-sm text-slate-500", children: "\u041E\u0442\u043C\u0435\u0442\u044C \u0447\u0435\u043A\u0431\u043E\u043A\u0441\u0430\u043C\u0438, \u043A\u0430\u043A\u0438\u0435 \u0440\u0430\u0437\u0434\u0435\u043B\u044B \u0432\u0438\u0434\u0438\u0442 \u043A\u0430\u0436\u0434\u044B\u0439 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A \u0432 \u0431\u043E\u043A\u043E\u0432\u043E\u043C \u043C\u0435\u043D\u044E. \u0421\u0432\u043E\u0438\u0445 \u0434\u043E\u0441\u0442\u0443\u043F\u043E\u0432 \u0432\u043B\u0430\u0434\u0435\u043B\u0435\u0446 \u043D\u0435 \u043C\u0435\u043D\u044F\u0435\u0442 \u2014 \u043E\u043D \u0432\u0441\u0435\u0433\u0434\u0430 \u0432\u0438\u0434\u0438\u0442 \u0432\u0441\u0451." })] })] }), employeesQuery.isLoading ? (_jsx("p", { className: "text-sm text-slate-500", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" })) : employees.length === 0 ? (_jsx("div", { className: "rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500", children: "\u0423 \u0442\u0435\u0431\u044F \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u043E\u0432. \u0414\u043E\u0431\u0430\u0432\u044C \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u0430 \u0438\u043B\u0438 \u0441\u043A\u043B\u0430\u0434\u043E\u0432\u0449\u0438\u043A\u0430 \u0447\u0435\u0440\u0435\u0437 \u00AB\u041C\u0430\u0433\u0430\u0437\u0438\u043D\u00BB (\u0438\u043B\u0438 \u043F\u043E\u043F\u0440\u043E\u0441\u0438 \u043C\u0435\u043D\u044F)." })) : (_jsx("div", { className: "space-y-4", children: employees.map((emp) => {
                    const draft = drafts[emp.id] ?? {};
                    return (_jsxs("div", { className: "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm", children: [_jsxs("div", { className: "mb-3 flex flex-wrap items-center justify-between gap-2", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(ShieldCheck, { size: 18, className: "text-slate-400" }), _jsx("h3", { className: "text-base font-semibold text-slate-800", children: emp.name }), _jsx("span", { className: "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600", children: emp.role === "seller" ? "Продавец" : emp.role === "warehouse" ? "Склад" : emp.role })] }), _jsx("p", { className: "text-xs text-slate-500", children: emp.phone })] }), _jsx("button", { type: "button", onClick: () => saveMutation.mutate({ id: emp.id, overrides: draft }), disabled: saveMutation.isPending, className: "rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60", children: saveMutation.isPending ? "Сохраняю…" : "💾 Сохранить" })] }), _jsx("div", { className: "grid gap-2 sm:grid-cols-2", children: visibleSections.map((section) => {
                                    const checked = draft[section.path] ?? false;
                                    return (_jsxs("label", { className: `flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? "border-primary/40 bg-indigo-50/60" : "border-slate-200 bg-white"}`, children: [_jsx("input", { type: "checkbox", checked: checked, onChange: () => toggle(emp.id, section.path), className: "mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-300 text-primary focus:ring-primary/30" }), _jsxs("span", { className: "flex-1", children: [_jsx("span", { className: "font-medium text-slate-800", children: section.label }), section.hint ? (_jsx("span", { className: "block text-xs text-slate-500", children: section.hint })) : null] })] }, section.path));
                                }) })] }, emp.id));
                }) }))] }));
}
