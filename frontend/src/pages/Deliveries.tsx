import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";

type DeliveryItem = {
  id: number;
  created_at: string | null;
  delivery_date: string | null;
  delivery_type: "included" | "separate";
  delivery_address: string | null;
  delivery_price: string;
  customer_name: string | null;
  sale_total: string;
  paid_total: string;
  status: string;
};

type DeliveriesResponse = {
  items: DeliveryItem[];
  summary: { count: number; sum_sales: string; sum_delivery_fee: string };
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtMoney(v: string | number): string {
  const n = Number(v) || 0;
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU");
}

const STATUS_LABEL: Record<string, string> = {
  completed: "Оплачено",
  debt: "Долг",
  installment: "Рассрочка",
  returned: "Возврат",
};

export function DeliveriesPage() {
  const today = isoDate(new Date());
  const monthAgo = isoDate(new Date(Date.now() - 30 * 24 * 3600 * 1000));
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);

  const deliveriesQuery = useQuery({
    queryKey: ["deliveries", from, to],
    queryFn: async () =>
      (
        await api.get("/deliveries", { params: { from, to } })
      ).data as DeliveriesResponse,
  });

  const items = useMemo(() => deliveriesQuery.data?.items ?? [], [deliveriesQuery.data]);
  const summary = deliveriesQuery.data?.summary;

  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">Доставки</h1>

      {/* Период */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs text-slate-500">С</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">По</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2 text-sm">
          {[
            { label: "Сегодня", from: today, to: today },
            { label: "Неделя", from: isoDate(new Date(Date.now() - 7 * 24 * 3600 * 1000)), to: today },
            { label: "Месяц", from: monthAgo, to: today },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => { setFrom(p.from); setTo(p.to); }}
              className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-primary hover:text-primary"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Сводка */}
      {summary ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Доставок</p>
            <p className="mt-1 text-2xl font-bold text-slate-800">{summary.count}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Сумма продаж</p>
            <p className="mt-1 text-2xl font-bold text-slate-800">{fmtMoney(summary.sum_sales)} сом</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Из них за доставку</p>
            <p className="mt-1 text-2xl font-bold text-slate-800">{fmtMoney(summary.sum_delivery_fee)} сом</p>
          </div>
        </div>
      ) : null}

      {/* Таблица истории */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {deliveriesQuery.isLoading ? (
          <p className="p-4 text-sm text-slate-500">Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            За выбранный период доставок не было.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Создано</th>
                  <th className="px-3 py-2">Дата доставки</th>
                  <th className="px-3 py-2">Клиент</th>
                  <th className="px-3 py-2">Адрес</th>
                  <th className="px-3 py-2 text-right">Сумма продажи</th>
                  <th className="px-3 py-2 text-right">Цена доставки</th>
                  <th className="px-3 py-2 text-right">Оплачено</th>
                  <th className="px-3 py-2">Статус</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id} className="border-t hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmtDateTime(d.created_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">{fmtDate(d.delivery_date)}</td>
                    <td className="px-3 py-2">{d.customer_name ?? <span className="text-slate-400">без клиента</span>}</td>
                    <td className="px-3 py-2 text-slate-600">{d.delivery_address ?? <span className="text-slate-400">—</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(d.sale_total)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {d.delivery_type === "included" ? (
                        <span className="text-xs text-slate-500">включена</span>
                      ) : (
                        fmtMoney(d.delivery_price)
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fmtMoney(d.paid_total)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          d.status === "debt"
                            ? "bg-amber-50 text-amber-700"
                            : d.status === "returned"
                            ? "bg-red-50 text-red-700"
                            : d.status === "installment"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {STATUS_LABEL[d.status] ?? d.status}
                      </span>
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
