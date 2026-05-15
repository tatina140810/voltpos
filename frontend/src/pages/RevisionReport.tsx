import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText } from "lucide-react";

import { api } from "../lib/api";

type ReportItem = {
  product_id: number;
  product_name: string;
  barcode: string | null;
  expected_qty: string;
  actual_qty: string;
  delta: string;
  purchase_price: string;
  diff_value: string;
};

type Report = {
  id: number;
  status: "active" | "completed";
  created_at: string | null;
  completed_at: string | null;
  summary: {
    items_total: number;
    items_with_diff: number;
    surplus_value: string;
    shortage_value: string;
    net_value: string;
  };
  items: ReportItem[];
};

function fmtMoney(v: string | number): string {
  return Number(v || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function RevisionReportPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const reportQuery = useQuery({
    queryKey: ["revision-report", id],
    enabled: Number.isFinite(id),
    queryFn: async () => (await api.get(`/revisions/${id}/report`)).data as Report,
  });

  const data = reportQuery.data;

  const downloadExcel = async () => {
    const res = await api.get(`/revisions/${id}/export`, { responseType: "blob" });
    const blob = new Blob([res.data], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revision_${id}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto max-w-5xl p-3">
      <div className="mb-4 flex items-center gap-2">
        <Link to="/revisions" className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Назад">
          <ArrowLeft size={18} />
        </Link>
        <FileText size={20} className="text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800">
            Отчёт по ревизии #{id}
          </h1>
          {data ? (
            <p className="text-xs text-slate-500">
              {data.status === "active" ? "Активна" : "Завершена"} · создана {fmtDate(data.created_at)}
              {data.completed_at ? ` · завершена ${fmtDate(data.completed_at)}` : ""}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={downloadExcel}
          disabled={!data || data.items.length === 0}
          className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          <Download size={16} /> Excel
        </button>
      </div>

      {reportQuery.isLoading ? (
        <p className="text-sm text-slate-500">Загрузка…</p>
      ) : !data ? (
        <p className="text-sm text-red-600">Ревизия не найдена</p>
      ) : (
        <>
          {/* Сводка */}
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Подсчитано позиций</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{data.summary.items_total}</p>
              <p className="text-xs text-slate-500">с расхождениями: {data.summary.items_with_diff}</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Излишек</p>
              <p className="mt-1 text-2xl font-bold text-blue-700">+{fmtMoney(data.summary.surplus_value)} сом</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">Недостача</p>
              <p className="mt-1 text-2xl font-bold text-red-700">{fmtMoney(data.summary.shortage_value)} сом</p>
            </div>
          </div>

          {/* Таблица */}
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            {data.items.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">Позиций пока нет.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Товар</th>
                      <th className="px-3 py-2">Штрихкод</th>
                      <th className="px-3 py-2 text-right">Ожидалось</th>
                      <th className="px-3 py-2 text-right">Факт</th>
                      <th className="px-3 py-2 text-right">Δ</th>
                      <th className="px-3 py-2 text-right">Цена закуп</th>
                      <th className="px-3 py-2 text-right">Сумма Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((it) => {
                      const delta = Number(it.delta);
                      const diff = Number(it.diff_value);
                      return (
                        <tr key={it.product_id} className="border-t hover:bg-slate-50">
                          <td className="px-3 py-2">{it.product_name}</td>
                          <td className="px-3 py-2 font-mono text-xs">{it.barcode ?? "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.expected_qty}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{it.actual_qty}</td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums font-semibold ${
                              delta === 0
                                ? "text-slate-400"
                                : delta > 0
                                ? "text-blue-700"
                                : "text-red-700"
                            }`}
                          >
                            {delta > 0 ? `+${it.delta}` : it.delta}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">{fmtMoney(it.purchase_price)}</td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums font-semibold ${
                              diff > 0 ? "text-blue-700" : diff < 0 ? "text-red-700" : "text-slate-400"
                            }`}
                          >
                            {diff > 0 ? "+" : ""}{fmtMoney(it.diff_value)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
