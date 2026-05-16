import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { NotificationsCard } from "../components/NotificationsCard";
import { useBusinessSettings } from "../hooks/useBusinessSettings";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";

type SaleRow = {
  id: number;
  created_at: string | null;
  seller_name: string;
  customer_name?: string | null;
  items_count: number;
  items_names: string;
  total: string;
  paid_cash: string;
  paid_card: string;
  paid_transfer: string;
  status: string;
};

type Withdrawal = {
  id: number;
  created_at: string | null;
  recipient: string;
  amount: string;
  reason: string | null;
  issued_by_name?: string | null;
};

type SellerRow = {
  seller_id: number;
  seller_name: string;
  sales_count: number;
  revenue: string;
};

type DeliveryRow = {
  sale_id: number;
  created_at: string | null;
  customer_name: string | null;
  address: string | null;
  delivery_date: string | null;
  type: string;
  price: string;
};

type InstallationRow = {
  sale_id: number;
  created_at: string | null;
  customer_name: string | null;
  price: string;
};

type SummaryReport = {
  period: { from: string | null; to: string | null };
  revenue: {
    cash: string; card: string; transfer: string; total: string;
    sales_only?: { cash: string; card: string; transfer: string; total: string };
    debt_payments?: { cash: string; card: string; transfer: string; total: string };
  };
  profit?: {
    revenue: string; cost: string; salary: string; other_expenses: string;
    revision_surplus?: string; revision_shortage?: string; revision_net?: string;
    total: string;
  };
  revisions_period?: {
    surplus_value: string; shortage_value: string; net_value: string; movements_count: number;
  };
  sales: {
    count: number;
    total_amount: string;
    subtotal?: string;
    discount_total?: string;
    cost_total?: string;
    completed_count: number;
    debt_count: number;
    returned_count: number;
  };
  returns: { count: number; amount: string };
  debt: { new_debt_amount: string; outstanding_total: string };
  cash_withdrawals: {
    count: number;
    total: string;
    by_method?: { cash: string; card: string; transfer: string };
    items: Withdrawal[];
  };
  supplier_payments?: {
    count: number;
    total: string;
    by_supplier: Array<{
      supplier_id: number;
      supplier_name: string | null;
      total: string;
      cash: string;
      card: string;
      transfer: string;
      count: number;
    }>;
  };
  net_card?: string;
  net_transfer?: string;
  net_cash: string;
  by_seller: SellerRow[];
  by_day: { date: string; revenue: number; sales_count: number }[];
  sales_list: SaleRow[];
  deliveries?: { count: number; total: string; items: DeliveryRow[] };
  installations?: { count: number; total: string; items: InstallationRow[] };
};

type RangePreset = "today" | "week" | "month" | "custom";

/** Возвращает локальную дату YYYY-MM-DD без сдвига в UTC.
 *  toISOString() возвращает UTC-дату, что в +6 (Бишкек) может «сдвинуть» сегодня
 *  на вчера утром после полуночи и наоборот. */
function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const WRITEOFF_LABEL: Record<string, string> = {
  expired: "⏰ Просрочка",
  damaged: "💥 Порча / бой",
  theft: "🚫 Кража",
  own_use: "🏠 Внутр. использование",
  return_to_supplier: "↩️ Возврат поставщику",
  other: "📦 Другое",
};

function resolveRange(preset: RangePreset, customFrom: string, customTo: string) {
  const now = new Date();
  if (preset === "today") {
    const day = isoDate(startOfToday());
    return { from: day, to: day };
  }
  if (preset === "week") {
    const from = new Date();
    from.setDate(now.getDate() - 6);
    return { from: isoDate(from), to: isoDate(now) };
  }
  if (preset === "month") {
    return { from: isoDate(startOfMonth()), to: isoDate(now) };
  }
  return { from: customFrom, to: customTo };
}

function detectPaymentMethod(sale: SaleRow): string {
  const cash = Number(sale.paid_cash);
  const card = Number(sale.paid_card);
  const transfer = Number(sale.paid_transfer);
  const nonzero = [cash > 0 ? "Наличные" : null, card > 0 ? "Карта" : null, transfer > 0 ? "Перевод" : null].filter(Boolean);
  if (nonzero.length === 0) return "—";
  if (nonzero.length === 1) return nonzero[0]!;
  return "Смешанная";
}

const STATUS_LABEL: Record<string, string> = {
  completed: "Оплачено",
  debt: "Долг",
  returned: "Возврат",
};

export function ReportsPage() {
  const role = useAuthStore((s) => s.role);
  const { hasDelivery } = useBusinessSettings();
  const [preset, setPreset] = useState<RangePreset>("today");
  const [customFrom, setCustomFrom] = useState(isoDate(new Date()));
  const [customTo, setCustomTo] = useState(isoDate(new Date()));
  const [reportPin, setReportPin] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [showPinModal, setShowPinModal] = useState(true);
  const [pinError, setPinError] = useState("");
  const [page, setPage] = useState(1);
  const [salaryInput, setSalaryInput] = useState("");
  const [otherExpensesList, setOtherExpensesList] = useState<{ amount: string; comment: string }[]>([
    { amount: "", comment: "" },
  ]);
  const queryClient = useQueryClient();

  if (role !== "owner") {
    return <Navigate to="/sale" replace />;
  }

  const range = resolveRange(preset, customFrom, customTo);

  const summaryQuery = useQuery({
    queryKey: ["reports-summary", range.from, range.to, reportPin],
    enabled: !!reportPin,
    queryFn: async () => {
      try {
        const response = await api.get("/reports/summary", {
          params: { from: range.from, to: range.to },
          headers: { "X-Report-Pin": reportPin },
        });
        return response.data as SummaryReport;
      } catch (err) {
        const status = (err as { response?: { status?: number } }).response?.status;
        if (status === 403) {
          setPinError("Неверный PIN");
          setShowPinModal(true);
          setReportPin("");
        }
        throw err;
      }
    },
  });

  const periodExpensesQuery = useQuery({
    queryKey: ["period-expenses", range.from, range.to, reportPin],
    enabled: !!reportPin,
    queryFn: async () => {
      const response = await api.get("/period-expenses", {
        params: { from: range.from, to: range.to },
        headers: { "X-Report-Pin": reportPin },
      });
      return response.data as {
        salary: string;
        other_expenses: { amount: string; comment: string; date?: string | null }[];
        editable: boolean;
      };
    },
  });

  const expensesEditable = periodExpensesQuery.data?.editable ?? (range.from === range.to);

  // При смене периода — подтянуть сохранённые поля.
  useEffect(() => {
    const data = periodExpensesQuery.data;
    if (!data) return;
    const salaryNum = Number(data.salary);
    setSalaryInput(salaryNum > 0 ? String(salaryNum) : "");
    if (data.other_expenses && data.other_expenses.length > 0) {
      setOtherExpensesList(
        data.other_expenses.map((r) => ({ amount: r.amount || "", comment: r.comment || "" })),
      );
    } else {
      setOtherExpensesList([{ amount: "", comment: "" }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodExpensesQuery.data, range.from, range.to]);

  const saveExpensesMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        salary: Number(salaryInput) || 0,
        other_expenses: otherExpensesList
          .filter((r) => r.amount || r.comment)
          .map((r) => ({ amount: r.amount || "", comment: r.comment || "" })),
      };
      const response = await api.put("/period-expenses", payload, {
        params: { from: range.from, to: range.to },
        headers: { "X-Report-Pin": reportPin },
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["period-expenses", range.from, range.to, reportPin] });
    },
  });

  const debtPaymentsQuery = useQuery({
    queryKey: ["reports-debt-payments", range.from, range.to, reportPin],
    enabled: !!reportPin,
    queryFn: async () => {
      const response = await api.get("/reports/debt-payments", {
        params: { date_from: range.from, date_to: range.to },
        headers: { "X-Report-Pin": reportPin },
      });
      return response.data as {
        total: number;
        count: number;
        payments: Array<{
          id: number;
          amount: number;
          method: string;
          comment: string | null;
          created_at: string | null;
          customer_id: number;
          customer_name: string;
          customer_phone: string;
          created_by: string | null;
          sale_id: number | null;
        }>;
      };
    },
  });

  const writeoffsQuery = useQuery({
    queryKey: ["reports-writeoffs", range.from, range.to, reportPin],
    enabled: !!reportPin,
    queryFn: async () => {
      const response = await api.get("/reports/writeoffs", {
        params: { from: range.from, to: range.to },
        headers: { "X-Report-Pin": reportPin },
      });
      return response.data as {
        summary: { count: number; total_qty: string; total_cost: string };
        by_reason: Array<{ reason: string; count: number; qty: string; cost: string }>;
        items: Array<{
          id: number;
          created_at: string | null;
          product_name: string;
          qty: string;
          cost_per: string;
          cost_total: string;
          reason: string;
          comment: string;
        }>;
      };
    },
  });

  const data = summaryQuery.data;
  const sales = data?.sales_list ?? [];
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(sales.length / pageSize));
  const pagedSales = sales.slice((page - 1) * pageSize, page * pageSize);

  // Текст «X продаж не было» зависит от выбранного периода.
  const emptyMessage = preset === "today"
    ? "Сегодня продаж не было"
    : preset === "week"
    ? "За последние 7 дней продаж не было"
    : preset === "month"
    ? "За месяц продаж не было"
    : "За выбранный период продаж не было";

  return (
    <main>
      <h1 className="mb-4 text-3xl font-semibold">Отчёты</h1>

      <section className="mb-4">
        <NotificationsCard />
      </section>

      {/* Range filter */}
      <section className="mb-4 rounded-2xl bg-white p-4 shadow">
        <div className="flex flex-wrap items-end gap-2">
          <select
            className="rounded-xl border p-3"
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value as RangePreset);
              setPage(1);
            }}
          >
            <option value="today">Сегодня</option>
            <option value="week">7 дней</option>
            <option value="month">Месяц</option>
            <option value="custom">Свой диапазон</option>
          </select>
          {preset === "custom" ? (
            <>
              <input
                type="date"
                className="rounded-xl border p-3"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <input
                type="date"
                className="rounded-xl border p-3"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </>
          ) : null}
          <span className="ml-auto text-sm text-slate-500">
            Период: {range.from} — {range.to}
          </span>
        </div>
      </section>

      {summaryQuery.isLoading ? <p className="text-slate-500">Загрузка отчёта...</p> : null}
      {summaryQuery.isError && !showPinModal ? (
        <p className="text-red-600">Не удалось загрузить отчёт</p>
      ) : null}

      {data && data.sales.count === 0 && data.cash_withdrawals.count === 0
        && !(debtPaymentsQuery.data && debtPaymentsQuery.data.count > 0) ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <p className="text-2xl font-semibold text-slate-700">{emptyMessage}</p>
          <p className="mt-2 text-sm text-slate-500">
            Также нет инкассации за этот период. Попробуйте выбрать другой диапазон.
          </p>
          <div className="mt-4 inline-block rounded-lg bg-slate-50 px-4 py-2 font-mono text-sm text-slate-600">
            Период: {range.from} — {range.to}
          </div>
          {data.debt.outstanding_total && Number(data.debt.outstanding_total) > 0 ? (
            <p className="mt-4 text-sm text-red-600">
              Общая текущая задолженность по магазину: <b>{num(data.debt.outstanding_total)} сом</b>
            </p>
          ) : null}
        </section>
      ) : null}

      {data && (
        data.sales.count > 0
        || data.cash_withdrawals.count > 0
        || (debtPaymentsQuery.data && debtPaymentsQuery.data.count > 0)
      ) ? (
        <>
          {/* === Cash withdrawals === */}
          <section className="mb-4 rounded-2xl bg-white p-4 shadow">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">💵 Инкассация за период</h2>
              <span className="text-lg font-bold text-red-600">−{num(data.cash_withdrawals.total)} сом</span>
            </div>
            {data.cash_withdrawals.items.length === 0 ? (
              <p className="text-sm text-slate-500">За выбранный период выдач не было</p>
            ) : (
              <div className="space-y-2">
                {data.cash_withdrawals.items.map((w) => (
                  <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
                    <div>
                      <p className="font-semibold">{w.recipient}</p>
                      {w.reason ? <p className="text-slate-600">{w.reason}</p> : null}
                      <p className="text-xs text-slate-500">
                        {w.created_at ? new Date(w.created_at).toLocaleString() : "—"} · {w.issued_by_name ?? "—"}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-red-600">−{num(w.amount)} сом</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* === By seller === */}
          <section className="mb-4 rounded-2xl bg-white p-4 shadow">
            <h2 className="mb-3 text-lg font-semibold">Отчёт по продавцам</h2>
            {data.by_seller.length === 0 ? (
              <p className="text-sm text-slate-500">Нет продаж в выбранном периоде</p>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="px-2 py-2">Продавец</th>
                      <th className="px-2 py-2">Кол-во продаж</th>
                      <th className="px-2 py-2">Реальная выручка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_seller.map((s) => (
                      <tr key={s.seller_id} className="border-b">
                        <td className="px-2 py-2 font-medium">{s.seller_name || `#${s.seller_id}`}</td>
                        <td className="px-2 py-2">{s.sales_count}</td>
                        <td className="px-2 py-2 font-semibold">{num(s.revenue)} сом</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* === Sales list === */}
          <section className="rounded-2xl bg-white p-4 shadow">
            <h2 className="mb-3 text-lg font-semibold">Все продажи периода ({sales.length})</h2>
            {sales.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">{emptyMessage}</p>
            ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="px-2 py-2">Дата</th>
                    <th className="px-2 py-2">Продавец</th>
                    <th className="px-2 py-2">Клиент</th>
                    <th className="px-2 py-2">Позиций</th>
                    <th className="px-2 py-2">Товары</th>
                    <th className="px-2 py-2">Сумма</th>
                    <th className="px-2 py-2">Получено</th>
                    <th className="px-2 py-2">Метод</th>
                    <th className="px-2 py-2">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedSales.map((row, idx) => {
                    const paid =
                      Number(row.paid_cash) + Number(row.paid_card) + Number(row.paid_transfer);
                    return (
                      <tr key={row.id} className={idx % 2 ? "bg-slate-50" : ""}>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-2 py-2">{row.seller_name || "—"}</td>
                        <td className="px-2 py-2">{row.customer_name ?? "—"}</td>
                        <td className="px-2 py-2">{row.items_count}</td>
                        <td className="px-2 py-2 max-w-xs truncate" title={row.items_names || undefined}>
                          {row.items_names || "—"}
                        </td>
                        <td className="px-2 py-2 font-medium">{num(row.total)}</td>
                        <td className="px-2 py-2">{paid.toFixed(2)}</td>
                        <td className="px-2 py-2 text-xs">{detectPaymentMethod(row)}</td>
                        <td className="px-2 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${
                              row.status === "debt"
                                ? "bg-red-100 text-red-700"
                                : row.status === "returned"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {STATUS_LABEL[row.status] ?? row.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
            {sales.length > pageSize ? (
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  className="rounded-lg border px-3 py-1 text-sm disabled:opacity-50"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Назад
                </button>
                <span className="text-sm text-slate-600">
                  {page} / {totalPages}
                </span>
                <button
                  className="rounded-lg border px-3 py-1 text-sm disabled:opacity-50"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Вперёд
                </button>
              </div>
            ) : null}
          </section>

          {/* === Доставки === */}
          {hasDelivery && data.deliveries && data.deliveries.count > 0 ? (
            <section className="mt-4 rounded-2xl bg-white p-4 shadow">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">🚚 Доставки за период ({data.deliveries.count})</h2>
                <span className="text-sm font-semibold">{num(data.deliveries.total)} сом</span>
              </div>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="px-2 py-2">Чек</th>
                      <th className="px-2 py-2">Дата чека</th>
                      <th className="px-2 py-2">Клиент</th>
                      <th className="px-2 py-2">Адрес</th>
                      <th className="px-2 py-2">Дата доставки</th>
                      <th className="px-2 py-2">Тип</th>
                      <th className="px-2 py-2 text-right">Цена</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.deliveries.items.map((d, idx) => (
                      <tr key={d.sale_id} className={idx % 2 ? "bg-slate-50" : ""}>
                        <td className="px-2 py-2">#{d.sale_id}</td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {d.created_at ? new Date(d.created_at).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-2 py-2">{d.customer_name ?? "—"}</td>
                        <td className="px-2 py-2">{d.address ?? "—"}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{d.delivery_date ?? "—"}</td>
                        <td className="px-2 py-2 text-xs">
                          {d.type === "separate" ? "Отдельно" : d.type === "included" ? "Включена" : "—"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums font-medium">
                          {Number(d.price) > 0 ? `${num(d.price)} сом` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* === Ревизии за период (излишки/недостачи) === */}
          {data.revisions_period && data.revisions_period.movements_count > 0 ? (
            <section className="mt-4 rounded-2xl bg-white p-4 shadow">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  📋 Ревизии за период ({data.revisions_period.movements_count} движений)
                </h2>
                <span
                  className={`text-sm font-semibold ${
                    Number(data.revisions_period.net_value) >= 0 ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {Number(data.revisions_period.net_value) >= 0 ? "+" : ""}
                  {num(data.revisions_period.net_value)} сом
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-emerald-50 p-3 text-sm">
                  <p className="text-xs text-emerald-700">Излишек (по закупке)</p>
                  <p className="mt-1 text-xl font-bold text-emerald-800">
                    +{num(data.revisions_period.surplus_value)} сом
                  </p>
                </div>
                <div className="rounded-xl border bg-red-50 p-3 text-sm">
                  <p className="text-xs text-red-700">Недостача (по закупке)</p>
                  <p className="mt-1 text-xl font-bold text-red-800">
                    −{num(data.revisions_period.shortage_value)} сом
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Излишек и недостача уже учтены в прибыли (см. блок «Итог»). Каждое движение — это пересчёт остатка на складе.
              </p>
            </section>
          ) : null}

          {/* === Оплаты поставщикам за период === */}
          {data.supplier_payments && data.supplier_payments.count > 0 ? (
            <section className="mt-4 rounded-2xl bg-white p-4 shadow">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  🏭 Оплачено поставщикам ({data.supplier_payments.count})
                </h2>
                <span className="text-sm font-semibold text-slate-700">
                  −{num(data.supplier_payments.total)} сом
                </span>
              </div>
              <p className="mb-3 text-xs text-slate-500">
                Это движение денег: уменьшается касса/счёт, но <b>не уменьшает прибыль</b>
                (товар становится активом, а его себестоимость спишется при продаже).
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Поставщик</th>
                      <th className="px-2 py-2 text-right">Платежей</th>
                      <th className="px-2 py-2 text-right">Нал</th>
                      <th className="px-2 py-2 text-right">Карта</th>
                      <th className="px-2 py-2 text-right">Перевод</th>
                      <th className="px-2 py-2 text-right">Итого</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.supplier_payments.by_supplier.map((s) => (
                      <tr key={s.supplier_id} className="border-t">
                        <td className="px-2 py-2">{s.supplier_name ?? `#${s.supplier_id}`}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{s.count}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{num(s.cash)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{num(s.card)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{num(s.transfer)}</td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold">{num(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* === Потери (списания) === */}
          {writeoffsQuery.data && writeoffsQuery.data.summary.count > 0 ? (
            <section className="mt-4 rounded-2xl bg-white p-4 shadow">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">📦 Потери за период ({writeoffsQuery.data.summary.count})</h2>
                <span className="text-sm font-semibold text-red-700">
                  −{num(writeoffsQuery.data.summary.total_cost)} сом
                </span>
              </div>
              {writeoffsQuery.data.by_reason.length > 0 ? (
                <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {writeoffsQuery.data.by_reason.map((r) => (
                    <div key={r.reason} className="rounded-xl border bg-slate-50 p-3 text-sm">
                      <p className="font-semibold text-slate-700">{WRITEOFF_LABEL[r.reason] ?? r.reason}</p>
                      <p className="text-xs text-slate-500">
                        {r.count} позиций · {r.qty}
                      </p>
                      <p className="mt-1 text-base font-bold text-red-700">−{num(r.cost)} сом</p>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="px-2 py-2">Дата</th>
                      <th className="px-2 py-2">Товар</th>
                      <th className="px-2 py-2">Категория</th>
                      <th className="px-2 py-2 text-right">Кол-во</th>
                      <th className="px-2 py-2 text-right">Цена</th>
                      <th className="px-2 py-2 text-right">Сумма</th>
                      <th className="px-2 py-2">Комментарий</th>
                    </tr>
                  </thead>
                  <tbody>
                    {writeoffsQuery.data.items.map((it, idx) => (
                      <tr key={it.id} className={idx % 2 ? "bg-slate-50" : ""}>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {it.created_at ? new Date(it.created_at).toLocaleDateString("ru-RU") : "—"}
                        </td>
                        <td className="px-2 py-2">{it.product_name}</td>
                        <td className="px-2 py-2 text-xs">{WRITEOFF_LABEL[it.reason] ?? it.reason}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{it.qty}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{num(it.cost_per)}</td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold text-red-700">−{num(it.cost_total)}</td>
                        <td className="px-2 py-2 text-xs text-slate-600">{it.comment || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* === Установки === */}
          {data.installations && data.installations.count > 0 ? (
            <section className="mt-4 rounded-2xl bg-white p-4 shadow">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">🛠 Установки за период ({data.installations.count})</h2>
                <span className="text-sm font-semibold">{num(data.installations.total)} сом</span>
              </div>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="px-2 py-2">Чек</th>
                      <th className="px-2 py-2">Дата</th>
                      <th className="px-2 py-2">Клиент</th>
                      <th className="px-2 py-2 text-right">Цена</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.installations.items.map((i, idx) => (
                      <tr key={i.sale_id} className={idx % 2 ? "bg-slate-50" : ""}>
                        <td className="px-2 py-2">#{i.sale_id}</td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {i.created_at ? new Date(i.created_at).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-2 py-2">{i.customer_name ?? "—"}</td>
                        <td className="px-2 py-2 text-right tabular-nums font-medium">
                          {Number(i.price) > 0 ? `${num(i.price)} сом` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* === Погашения долгов === */}
          {debtPaymentsQuery.data && debtPaymentsQuery.data.count > 0 ? (
            <section className="mt-4 rounded-2xl bg-white p-4 shadow">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">💵 Погашения долгов ({debtPaymentsQuery.data.count})</h2>
                <span className="text-sm font-semibold text-emerald-700">
                  {num(debtPaymentsQuery.data.total)} сом
                </span>
              </div>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="px-2 py-2">Дата</th>
                      <th className="px-2 py-2">Клиент</th>
                      <th className="px-2 py-2">Телефон</th>
                      <th className="px-2 py-2 text-right">Сумма</th>
                      <th className="px-2 py-2">Способ</th>
                      <th className="px-2 py-2">Продавец</th>
                      <th className="px-2 py-2">К продаже</th>
                      <th className="px-2 py-2">Комментарий</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debtPaymentsQuery.data.payments.map((p, idx) => (
                      <tr key={p.id} className={idx % 2 ? "bg-slate-50" : ""}>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {p.created_at ? new Date(p.created_at).toLocaleString("ru-RU") : "—"}
                        </td>
                        <td className="px-2 py-2 font-medium">{p.customer_name}</td>
                        <td className="px-2 py-2 text-xs text-slate-500">{p.customer_phone}</td>
                        <td className="px-2 py-2 text-right font-semibold text-emerald-700">
                          {num(p.amount)}
                        </td>
                        <td className="px-2 py-2">
                          {p.method === "cash" ? "Нал" : p.method === "card" ? "Карта" : "Перевод"}
                        </td>
                        <td className="px-2 py-2">{p.created_by ?? "—"}</td>
                        <td className="px-2 py-2 text-slate-500">{p.sale_id ? `#${p.sale_id}` : "—"}</td>
                        <td className="px-2 py-2 text-xs text-slate-600">{p.comment ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* === Бухгалтерский итог === */}
          <AccountingSummary
            data={data}
            salaryInput={salaryInput}
            setSalaryInput={setSalaryInput}
            otherExpensesList={otherExpensesList}
            setOtherExpensesList={setOtherExpensesList}
            onSave={() => saveExpensesMutation.mutate()}
            isSaving={saveExpensesMutation.isPending}
            isSaved={saveExpensesMutation.isSuccess}
            editable={expensesEditable}
          />
        </>
      ) : null}

      {showPinModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-xl font-semibold">Введите Report PIN</h3>
            <p className="mt-1 text-sm text-slate-500">Доступ к отчётам только для владельца</p>
            <input
              type="password"
              maxLength={4}
              autoFocus
              className="mt-4 w-full rounded-xl border p-3 text-center text-xl tracking-[0.4em]"
              placeholder="••••"
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4));
                if (pinError) setPinError("");
              }}
            />
            {pinError ? <p className="mt-2 text-sm text-red-600">{pinError}</p> : null}
            <button
              className="mt-4 w-full rounded-xl bg-primary p-3 font-medium text-white disabled:opacity-50"
              disabled={pinInput.length < 4}
              onClick={() => {
                setReportPin(pinInput);
                setShowPinModal(false);
                setPinError("");
              }}
            >
              Подтвердить
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function num(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function AccountingSummary({
  data,
  salaryInput,
  setSalaryInput,
  otherExpensesList,
  setOtherExpensesList,
  onSave,
  isSaving,
  isSaved,
  editable,
}: {
  data: SummaryReport;
  salaryInput: string;
  setSalaryInput: (v: string) => void;
  otherExpensesList: { amount: string; comment: string }[];
  setOtherExpensesList: (v: { amount: string; comment: string }[]) => void;
  onSave: () => void;
  isSaving: boolean;
  isSaved: boolean;
  editable: boolean;
}) {
  const cashIn = Number(data.revenue.cash);
  const cardIn = Number(data.revenue.card);
  const transferIn = Number(data.revenue.transfer);
  const inkas = Number(data.cash_withdrawals.total);
  const inkasCash = Number(data.cash_withdrawals.by_method?.cash ?? data.cash_withdrawals.total);
  const inkasCard = Number(data.cash_withdrawals.by_method?.card ?? 0);
  const inkasTransfer = Number(data.cash_withdrawals.by_method?.transfer ?? 0);
  const sale = Number(data.revenue.total); // продажа уже с учётом скидок
  const cost = Number(data.sales.cost_total ?? 0);
  const salary = Math.max(0, Number(salaryInput) || 0);
  const other = otherExpensesList.reduce(
    (sum, row) => sum + Math.max(0, Number(row.amount) || 0),
    0,
  );

  const updateRow = (idx: number, patch: Partial<{ amount: string; comment: string }>) => {
    setOtherExpensesList(otherExpensesList.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const addRow = () => {
    setOtherExpensesList([...otherExpensesList, { amount: "", comment: "" }]);
  };
  const removeRow = (idx: number) => {
    setOtherExpensesList(otherExpensesList.filter((_, i) => i !== idx));
  };

  // Сколько должно быть к концу периода — наличка минус инкассация, карта и
  // перевод трогаются только если из них что-то выдают (по умолчанию нет).
  // «Должно остаться» — вычитаем только выдачи того же метода (раньше неправильно
  // вычитали всю инкассацию из наличных).
  const cashLeft = cashIn - inkasCash;
  const cardLeft = cardIn - inkasCard;
  const transferLeft = transferIn - inkasTransfer;

  // Прибыль без инкассации (это просто перемещение денег, не расход бизнеса)
  // и без скидки (она уже в продаже). Плюс излишек/недостача ревизии (rev_net).
  const revNet = Number(data.revisions_period?.net_value ?? 0);
  const profit = sale - cost - salary - other + revNet;

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b bg-slate-50 px-4 py-3">
        <h2 className="text-lg font-semibold">Итог за период</h2>
        <p className="text-xs text-slate-500">Сколько должно быть денег и расчёт прибыли</p>
      </div>

      {/* Должно быть на конец дня */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-slate-50">
            <th colSpan={2} className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Должно быть к концу периода
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="px-4 py-3">💵 Наличные в кассе</td>
            <td className="px-4 py-3 text-right tabular-nums font-semibold">{num(cashLeft)} сом</td>
          </tr>
          {inkas > 0 ? (
            <tr className="border-b text-xs text-slate-500">
              <td className="px-4 pb-2 pl-8">из них получено: {num(cashIn)} сом, инкассация: −{num(inkas)} сом</td>
              <td></td>
            </tr>
          ) : null}
          {data.revenue.debt_payments && Number(data.revenue.debt_payments.total) > 0 ? (
            <tr className="border-b text-xs text-slate-500">
              <td className="px-4 pb-2 pl-8">
                из выручки <b>{num(data.revenue.sales_only?.total ?? 0)} сом</b> — продажи,{" "}
                <b>{num(data.revenue.debt_payments.total)} сом</b> — погашение долгов
                (нал {num(data.revenue.debt_payments.cash)}, карта {num(data.revenue.debt_payments.card)},
                перевод {num(data.revenue.debt_payments.transfer)})
              </td>
              <td></td>
            </tr>
          ) : null}
          <tr className="border-b">
            <td className="px-4 py-3">💳 На карте</td>
            <td className="px-4 py-3 text-right tabular-nums font-semibold">{num(cardLeft)} сом</td>
          </tr>
          <tr className="border-b">
            <td className="px-4 py-3">📱 На счёте (переводы)</td>
            <td className="px-4 py-3 text-right tabular-nums font-semibold">{num(transferLeft)} сом</td>
          </tr>
          <tr className="border-b bg-slate-50">
            <td className="px-4 py-3 font-semibold">Всего денег</td>
            <td className="px-4 py-3 text-right tabular-nums font-bold">{num(cashLeft + cardLeft + transferLeft)} сом</td>
          </tr>
        </tbody>
      </table>

      {/* Расчёт прибыли */}
      <table className="w-full border-t-4 border-slate-200 text-sm">
        <thead>
          <tr className="border-b bg-slate-50">
            <th colSpan={2} className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Расчёт прибыли
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="px-4 py-3">Продажа (с учётом скидок)</td>
            <td className="px-4 py-3 text-right tabular-nums">{num(sale)} сом</td>
          </tr>
          <tr className="border-b">
            <td className="px-4 py-3">Расход (закупочная стоимость товаров)</td>
            <td className="px-4 py-3 text-right tabular-nums text-red-700">−{num(cost)} сом</td>
          </tr>
          <tr className="border-b">
            <td className="px-4 py-3">Зарплата продавца за период</td>
            <td className="px-4 py-3 text-right">
              <input
                type="text"
                inputMode="decimal"
                value={salaryInput}
                onChange={(e) => setSalaryInput(e.target.value)}
                onFocus={(e) => { if (e.target.value === "0") setSalaryInput(""); }}
                placeholder="0"
                readOnly={!editable}
                className={`h-9 w-32 rounded-lg border px-3 text-right tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${editable ? "border-slate-300" : "border-slate-200 bg-slate-50 text-slate-500"}`}
              />
              <span className="ml-1 text-slate-500">сом</span>
            </td>
          </tr>
          {otherExpensesList.map((row, idx) => (
            <tr className="border-b" key={idx}>
              <td className="px-4 py-3">
                {idx === 0 ? (
                  <>
                    Прочие расходы
                    <span className="ml-1 text-xs text-slate-500">(аренда, коммунальные, налоги, уборка)</span>
                  </>
                ) : (
                  <span className="text-slate-600">Прочие расходы</span>
                )}
                <div className="mt-1">
                  <input
                    type="text"
                    value={row.comment}
                    onChange={(e) => updateRow(idx, { comment: e.target.value })}
                    placeholder="комментарий (например: аренда)"
                    readOnly={!editable}
                    className={`h-8 w-full max-w-md rounded-lg border px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${editable ? "border-slate-300" : "border-slate-200 bg-slate-50 text-slate-500"}`}
                  />
                </div>
              </td>
              <td className="px-4 py-3 text-right align-top">
                <div className="flex items-center justify-end gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(e) => updateRow(idx, { amount: e.target.value })}
                    onFocus={(e) => { if (e.target.value === "0") updateRow(idx, { amount: "" }); }}
                    placeholder="0"
                    readOnly={!editable}
                    className={`h-9 w-32 rounded-lg border px-3 text-right tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${editable ? "border-slate-300" : "border-slate-200 bg-slate-50 text-slate-500"}`}
                  />
                  <span className="text-slate-500">сом</span>
                  {editable && otherExpensesList.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="ml-1 flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-slate-500 hover:border-red-400 hover:bg-red-50 hover:text-red-600"
                      title="Удалить строку"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
          {editable ? (
            <tr className="border-b">
              <td colSpan={2} className="px-4 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={addRow}
                    className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:border-primary hover:text-primary"
                  >
                    <span className="text-lg leading-none">+</span>
                    Добавить строку прочих расходов
                  </button>
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
                  >
                    💾 {isSaving ? "Сохраняю…" : isSaved ? "Сохранено ✓" : "Сохранить"}
                  </button>
                </div>
              </td>
            </tr>
          ) : (
            <tr className="border-b bg-amber-50">
              <td colSpan={2} className="px-4 py-2 text-xs text-amber-800">
                Выбран период из нескольких дней — зарплата и прочие расходы автоматически просуммированы за этот период.
                Чтобы добавить или изменить расход, выберите конкретный день (например, «Сегодня» или один день в «За период»).
              </td>
            </tr>
          )}
          {revNet !== 0 ? (
            <tr className="border-b">
              <td className="px-4 py-3">
                Излишек / недостача ревизии
                <span className="ml-1 text-xs text-slate-500">(по закупочной цене)</span>
              </td>
              <td className={`px-4 py-3 text-right tabular-nums ${revNet >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {revNet >= 0 ? "+" : ""}{num(revNet)} сом
              </td>
            </tr>
          ) : null}
          <tr className="bg-emerald-50">
            <td className="px-4 py-4 text-base font-semibold">ПРИБЫЛЬ</td>
            <td className={`px-4 py-4 text-right tabular-nums text-2xl font-bold ${profit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
              {num(profit)} сом
            </td>
          </tr>
        </tbody>
      </table>

      <div className="border-t bg-slate-50 px-4 py-2 text-xs text-slate-500">
        Прибыль = Продажа − Расход − Зарплата − Прочие расходы. Скидка уже учтена в продаже, инкассация — это перемещение денег, не расход.
      </div>
    </section>
  );
}
