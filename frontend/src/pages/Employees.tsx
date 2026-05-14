import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, UserCog } from "lucide-react";

import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";
import { useBusinessSettings } from "../hooks/useBusinessSettings";

type Employee = {
  id: number;
  name: string;
  phone: string;
  role: "owner" | "seller" | "warehouse";
  menu_overrides: Record<string, boolean> | null;
};

// Все потенциальные разделы доступа, которые можно дать/отобрать.
// Если в магазине нет grocery — «Поставщики» всё равно показываем, но в реальности
// меню не появится (фильтр по business_type в Layout).
const ACCESS_SECTIONS: { path: string; label: string; hint?: string }[] = [
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
const DEFAULT_ACCESS: Record<Employee["role"], Set<string>> = {
  seller: new Set(["/sale", "/customers", "/deliveries", "/cash-withdrawals"]),
  warehouse: new Set(["/stock", "/products", "/suppliers"]),
  owner: new Set(ACCESS_SECTIONS.map((s) => s.path)), // owner видит всё
};

function isAllowed(emp: Employee, path: string): boolean {
  if (emp.menu_overrides && Object.prototype.hasOwnProperty.call(emp.menu_overrides, path)) {
    return emp.menu_overrides[path] === true;
  }
  return DEFAULT_ACCESS[emp.role]?.has(path) ?? false;
}

export function EmployeesPage() {
  const role = useAuthStore((s) => s.role);
  if (role !== "owner") {
    return <Navigate to="/sale" replace />;
  }
  return <EmployeesInner />;
}

function EmployeesInner() {
  const queryClient = useQueryClient();
  const { type: businessType } = useBusinessSettings();
  const isGrocery = businessType === "grocery";

  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: async () => (await api.get("/org/me/users")).data as Employee[],
  });

  // Локальные «черновые» доступы, чтобы юзер мог покликать чекбоксы и нажать
  // «Сохранить» для конкретного сотрудника.
  const [drafts, setDrafts] = useState<Record<number, Record<string, boolean>>>({});

  // Когда подгрузится список — инициализируем черновики из текущих overrides + дефолтов по роли.
  useEffect(() => {
    if (!employeesQuery.data) return;
    const initial: Record<number, Record<string, boolean>> = {};
    for (const emp of employeesQuery.data) {
      const map: Record<string, boolean> = {};
      for (const section of ACCESS_SECTIONS) {
        map[section.path] = isAllowed(emp, section.path);
      }
      initial[emp.id] = map;
    }
    setDrafts(initial);
  }, [employeesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async ({ id, overrides }: { id: number; overrides: Record<string, boolean> }) => {
      await api.put(`/org/users/${id}/menu`, { menu_overrides: overrides });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["auth-me"] });
    },
  });

  const visibleSections = useMemo(
    () => ACCESS_SECTIONS.filter((s) => s.path !== "/suppliers" || isGrocery),
    [isGrocery],
  );

  const toggle = (empId: number, path: string) => {
    setDrafts((prev) => ({
      ...prev,
      [empId]: { ...(prev[empId] ?? {}), [path]: !(prev[empId]?.[path] ?? false) },
    }));
  };

  // Только сотрудники, которым доступы вообще имеют смысл — не сам владелец и не deleted.
  const employees = (employeesQuery.data ?? []).filter((e) => e.role !== "owner");

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center gap-2">
        <UserCog size={22} className="text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Доступы сотрудников</h1>
          <p className="text-sm text-slate-500">
            Отметь чекбоксами, какие разделы видит каждый сотрудник в боковом меню.
            Своих доступов владелец не меняет — он всегда видит всё.
          </p>
        </div>
      </div>

      {employeesQuery.isLoading ? (
        <p className="text-sm text-slate-500">Загрузка…</p>
      ) : employees.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          У тебя пока нет сотрудников. Добавь продавца или складовщика через «Магазин» (или попроси меня).
        </div>
      ) : (
        <div className="space-y-4">
          {employees.map((emp) => {
            const draft = drafts[emp.id] ?? {};
            return (
              <div key={emp.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={18} className="text-slate-400" />
                      <h3 className="text-base font-semibold text-slate-800">{emp.name}</h3>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {emp.role === "seller" ? "Продавец" : emp.role === "warehouse" ? "Склад" : emp.role}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{emp.phone}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => saveMutation.mutate({ id: emp.id, overrides: draft })}
                    disabled={saveMutation.isPending}
                    className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                  >
                    {saveMutation.isPending ? "Сохраняю…" : "💾 Сохранить"}
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {visibleSections.map((section) => {
                    const checked = draft[section.path] ?? false;
                    return (
                      <label
                        key={section.path}
                        className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                          checked ? "border-primary/40 bg-indigo-50/60" : "border-slate-200 bg-white"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(emp.id, section.path)}
                          className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-300 text-primary focus:ring-primary/30"
                        />
                        <span className="flex-1">
                          <span className="font-medium text-slate-800">{section.label}</span>
                          {section.hint ? (
                            <span className="block text-xs text-slate-500">{section.hint}</span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
