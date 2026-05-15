import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, FileText, Play } from "lucide-react";

import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";

type Revision = {
  id: number;
  status: "active" | "completed";
  created_by: number;
  created_at: string | null;
  completed_at: string | null;
  completed_by: number | null;
  created_by_name: string | null;
  completed_by_name: string | null;
  note: string | null;
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
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
    queryFn: async () => (await api.get("/revisions")).data as Revision[],
  });
  const activeQuery = useQuery({
    queryKey: ["revisions-active"],
    queryFn: async () => (await api.get("/revisions/active")).data as { revision: Revision | null },
  });

  const createMutation = useMutation({
    mutationFn: async () => (await api.post("/revisions", { note: null })).data as Revision,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["revisions-list"] });
      qc.invalidateQueries({ queryKey: ["revisions-active"] });
      navigate("/revisions/active");
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      alert(detail ?? "Не удалось создать ревизию");
    },
  });

  const active = activeQuery.data?.revision ?? null;
  const items = listQuery.data ?? [];

  return (
    <main className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center gap-2">
        <ClipboardList size={22} className="text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Ревизия (инвентаризация)</h1>
          <p className="text-sm text-slate-500">
            Сверка фактических остатков с учётными. Несколько кладовщиков могут считать одновременно.
          </p>
        </div>
      </div>

      {/* Активная ревизия */}
      {active ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                Активная ревизия #{active.id}
              </p>
              <p className="text-xs text-emerald-700">
                Открыл: {active.created_by_name ?? "?"} · {fmt(active.created_at)}
              </p>
            </div>
            <Link
              to="/revisions/active"
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Play size={16} /> Считать товары
            </Link>
          </div>
        </div>
      ) : isOwner ? (
        <div className="mb-4 rounded-2xl border border-dashed border-indigo-300 bg-indigo-50 p-4 text-center">
          <p className="mb-2 text-sm text-slate-700">Активной ревизии нет</p>
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            <Play size={16} /> {createMutation.isPending ? "Создаю…" : "Начать новую ревизию"}
          </button>
        </div>
      ) : (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600">
          Активной ревизии нет. Попроси владельца её начать.
        </div>
      )}

      {/* История ревизий */}
      <div className="rounded-2xl bg-white shadow-sm">
        <div className="border-b px-4 py-3">
          <h2 className="text-base font-semibold text-slate-800">История ревизий</h2>
        </div>
        {listQuery.isLoading ? (
          <p className="p-4 text-sm text-slate-500">Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">Ревизий ещё не было.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">№</th>
                  <th className="px-3 py-2">Статус</th>
                  <th className="px-3 py-2">Открыл</th>
                  <th className="px-3 py-2">Создана</th>
                  <th className="px-3 py-2">Завершил</th>
                  <th className="px-3 py-2">Завершена</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono">#{r.id}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          r.status === "active"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {r.status === "active" ? "Активна" : "Завершена"}
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.created_by_name ?? "?"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmt(r.created_at)}</td>
                    <td className="px-3 py-2">{r.completed_by_name ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmt(r.completed_at)}</td>
                    <td className="px-3 py-2">
                      <Link
                        to={`/revisions/${r.id}/report`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <FileText size={14} /> Отчёт
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
