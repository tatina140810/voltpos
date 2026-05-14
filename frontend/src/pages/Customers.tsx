import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { NumberInput } from "../components/NumberInput";
import { api } from "../lib/api";

type Customer = {
  id: number;
  name: string;
  phone: string;
  discount_percent?: number;
  purchase_count?: number;
  address?: string;
  debt_amount?: number | string;
  oldest_debt_date?: string | null;
};

type CustomerDetails = {
  customer: Customer & { notes?: string | null };
  stats: {
    purchases_count: number;
    purchases_total: number | string;
    debt_amount: number | string;
  };
  recent_purchases: Array<{
    id: number;
    created_at: string;
    total: number | string;
    status: string;
  }>;
};

type PaymentHistory = {
  customer: { id: number; name: string; phone: string; total_debt: number };
  payments: Array<{
    id: number;
    amount: number;
    method: string;
    comment: string | null;
    created_at: string | null;
    created_by: string | null;
    sale_id: number | null;
  }>;
  sales_with_debt: Array<{
    id: number;
    date: string | null;
    total: number;
    paid: number;
    remaining_debt: number;
    promised_payment_date: string | null;
  }>;
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Наличными",
  card: "Картой",
  transfer: "Переводом",
};

const SALE_STATUS_LABEL: Record<string, string> = {
  completed: "Оплачено",
  debt: "Долг",
  returned: "Возврат",
};

export function CustomersPage() {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", discount_percent: "0" });
  const queryClient = useQueryClient();

  const customersQuery = useQuery({
    queryKey: ["customers", search],
    queryFn: async () => {
      const response = await api.get("/customers", { params: { search: search || undefined } });
      return response.data as Customer[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      api.post("/customers", {
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
      if (aDebt > 0 && bDebt === 0) return -1;
      if (aDebt === 0 && bDebt > 0) return 1;
      if (aDebt > 0 && bDebt > 0) {
        const aDate = a.oldest_debt_date ? new Date(a.oldest_debt_date).getTime() : 0;
        const bDate = b.oldest_debt_date ? new Date(b.oldest_debt_date).getTime() : 0;
        return aDate - bDate; // oldest debt first
      }
      return b.id - a.id;
    });
    return list;
  }, [customersQuery.data]);

  const totalDebt = useMemo(
    () => customers.reduce((acc, c) => acc + Number(c.debt_amount || 0), 0),
    [customers],
  );

  return (
    <main>
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-semibold">Клиенты</h1>
        <button onClick={() => setShowForm(true)} className="rounded-xl bg-primary px-4 py-3 text-white">
          Добавить клиента
        </button>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по имени и телефону"
          className="mb-4 w-full rounded-xl border p-3"
        />
        <div className="space-y-2">
          {customers.map((customer) => {
            const debt = Number(customer.debt_amount || 0);
            const oldestDebt = customer.oldest_debt_date
              ? new Date(customer.oldest_debt_date).toLocaleDateString()
              : null;
            return (
              <button
                key={customer.id}
                type="button"
                onClick={() => setSelectedId(customer.id)}
                className={`block w-full rounded-xl border p-3 text-left transition-colors hover:bg-slate-50 ${
                  debt > 0 ? "border-red-300 bg-red-50" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{customer.name}</p>
                    <p className="text-sm text-slate-600">{customer.phone}</p>
                  </div>
                  <div className="text-right text-sm">
                    {debt > 0 ? (
                      <>
                        <p className="text-base font-bold text-red-600">Долг: {debt.toFixed(2)} сом</p>
                        {oldestDebt ? <p className="text-xs text-red-700">с {oldestDebt}</p> : null}
                      </>
                    ) : (
                      <p>Скидка: {Number(customer.discount_percent ?? 0).toFixed(0)}%</p>
                    )}
                    <p className="text-slate-500">Покупок: {customer.purchase_count ?? 0}</p>
                  </div>
                </div>
              </button>
            );
          })}
          {!customers.length ? <p className="text-sm text-slate-500">Клиенты не найдены</p> : null}
          {totalDebt > 0 ? (
            <div className="mt-3 flex items-center justify-between rounded-xl border-2 border-red-300 bg-red-100 p-3">
              <span className="font-semibold text-red-900">Итого по должникам</span>
              <span className="text-xl font-bold text-red-700">{totalDebt.toFixed(2)} сом</span>
            </div>
          ) : null}
        </div>
      </div>

      {selectedId !== null ? (
        <CustomerDetailsModal id={selectedId} onClose={() => setSelectedId(null)} />
      ) : null}

      {showForm ? (
        <div className="fixed inset-0 z-40 bg-black/40 p-4">
          <div className="mx-auto max-w-md rounded-2xl bg-white p-4">
            <h2 className="mb-3 text-xl font-semibold">Новый клиент</h2>
            <div className="space-y-3">
              <input
                className="w-full rounded-xl border p-3"
                placeholder="Имя"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <input
                className="w-full rounded-xl border p-3"
                placeholder="Телефон"
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
              <input
                className="w-full rounded-xl border p-3"
                placeholder="Адрес"
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
              />
              <NumberInput
                className="w-full rounded-xl border p-3"
                placeholder="Скидка %"
                value={form.discount_percent}
                onChange={(value) => setForm((prev) => ({ ...prev, discount_percent: value }))}
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => createMutation.mutate()}
                className="flex-1 rounded-xl bg-primary p-3 text-white"
              >
                Сохранить
              </button>
              <button className="flex-1 rounded-xl border p-3" onClick={() => setShowForm(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function CustomerDetailsModal({ id, onClose }: { id: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "card" | "transfer">("cash");
  const [payComment, setPayComment] = useState("");
  const detailsQuery = useQuery({
    queryKey: ["customer-details", id],
    queryFn: async () => (await api.get(`/customers/${id}/details`)).data as CustomerDetails,
  });
  const historyQuery = useQuery<PaymentHistory>({
    queryKey: ["customer-payments", id],
    queryFn: async () => (await api.get(`/customers/${id}/payment-history`)).data as PaymentHistory,
  });
  const data = detailsQuery.data;

  const payDebtMutation = useMutation({
    mutationFn: async () =>
      api.post(`/customers/${id}/pay-debt`, {
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
    mutationFn: async ({ saleId, date }: { saleId: number; date: string | null }) => {
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
    onError: (err: unknown) => {
      const msg = (err as { response?: { status?: number } })?.response?.status === 403
        ? "Удалять клиентов может только владелец"
        : "Не удалось удалить клиента";
      alert(msg);
    },
  });

  const handleDelete = () => {
    if (!data) return;
    if (window.confirm(`Удалить клиента "${data.customer.name}"? Это действие нельзя отменить.`)) {
      deleteMutation.mutate();
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 p-4" onClick={onClose}>
      <div
        className="mx-auto max-h-[90dvh] max-w-md overflow-auto rounded-2xl bg-white p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{data?.customer.name ?? "..."}</h2>
            <p className="text-slate-600">{data?.customer.phone ?? ""}</p>
          </div>
          <button className="text-2xl text-slate-500" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        {detailsQuery.isLoading ? (
          <p className="text-sm text-slate-500">Загрузка...</p>
        ) : detailsQuery.isError ? (
          <p className="text-sm text-red-600">Не удалось загрузить данные</p>
        ) : data ? (
          <div className="space-y-4">
            {data.customer.address ? (
              <Section title="Адрес">
                <p className="text-sm">{data.customer.address}</p>
              </Section>
            ) : null}

            {Number(data.customer.discount_percent ?? 0) > 0 ? (
              <Section title="Скидка">
                <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-700">
                  {Number(data.customer.discount_percent).toFixed(0)}%
                </span>
              </Section>
            ) : null}

            <Section title="Покупки">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-slate-500">Всего покупок</p>
                  <p className="text-xl font-semibold">{data.stats.purchases_count}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-slate-500">Сумма</p>
                  <p className="text-xl font-semibold">{Number(data.stats.purchases_total).toFixed(2)} сом</p>
                </div>
              </div>
            </Section>

            {Number(data.stats.debt_amount) > 0 ? (
              <Section title="Долг">
                <p className="text-2xl font-bold text-red-600">{Number(data.stats.debt_amount).toFixed(2)} сом</p>
                <div className="mt-3 space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-medium text-red-900">Внести оплату долга</p>
                  <NumberInput
                    value={payAmount}
                    onChange={setPayAmount}
                    placeholder="Сумма"
                    className="h-11 w-full rounded-xl border px-3"
                  />
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as "cash" | "card" | "transfer")}
                    className="h-11 w-full rounded-xl border bg-white px-3"
                  >
                    <option value="cash">Наличными</option>
                    <option value="card">Картой</option>
                    <option value="transfer">Переводом</option>
                  </select>
                  <input
                    value={payComment}
                    onChange={(e) => setPayComment(e.target.value)}
                    placeholder="Комментарий (необязательно)"
                    className="h-11 w-full rounded-xl border px-3"
                  />
                  <button
                    type="button"
                    onClick={() => payDebtMutation.mutate()}
                    disabled={!payAmount || Number(payAmount) <= 0 || payDebtMutation.isPending}
                    className="h-11 w-full rounded-xl bg-emerald-600 font-semibold text-white disabled:opacity-50"
                  >
                    {payDebtMutation.isPending ? "Сохранение..." : "Внести"}
                  </button>
                </div>
              </Section>
            ) : null}

            {historyQuery.data && historyQuery.data.sales_with_debt && historyQuery.data.sales_with_debt.length > 0 ? (
              <Section title="Долговые продажи">
                <div className="space-y-2">
                  {historyQuery.data.sales_with_debt.map((sd) => {
                    const today = new Date().toISOString().slice(0, 10);
                    const isToday = sd.promised_payment_date === today;
                    const isOverdue = !!sd.promised_payment_date && sd.promised_payment_date < today;
                    return (
                      <div key={sd.id} className="rounded-xl border p-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">
                            #{sd.id} · {sd.remaining_debt.toFixed(2)} сом
                          </span>
                          <span className="text-xs text-slate-500">
                            {sd.date ? new Date(sd.date).toLocaleDateString("ru-RU") : "—"}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <label className="text-xs text-slate-500">Обещал вернуть до:</label>
                          <input
                            type="date"
                            value={sd.promised_payment_date ?? ""}
                            onChange={(e) =>
                              setPromisedDateMutation.mutate({
                                saleId: sd.id,
                                date: e.target.value || null,
                              })
                            }
                            className={`h-8 rounded-lg border px-2 text-xs ${
                              isOverdue
                                ? "border-red-300 bg-red-50 text-red-700"
                                : isToday
                                ? "border-amber-300 bg-amber-50 text-amber-700"
                                : "border-slate-300"
                            }`}
                          />
                          {sd.promised_payment_date ? (
                            <button
                              type="button"
                              onClick={() =>
                                setPromisedDateMutation.mutate({ saleId: sd.id, date: null })
                              }
                              className="text-xs text-slate-500 underline hover:text-slate-700"
                              title="Убрать дату"
                            >
                              убрать
                            </button>
                          ) : null}
                        </div>
                        {isOverdue ? (
                          <p className="mt-1 text-xs font-medium text-red-700">⚠ Срок прошёл — позвонить!</p>
                        ) : isToday ? (
                          <p className="mt-1 text-xs font-medium text-amber-700">📞 Сегодня обещал — позвонить</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Поставь дату «обещал вернуть до» — утром получишь push-напоминание позвонить.
                </p>
              </Section>
            ) : null}

            {historyQuery.data && historyQuery.data.payments.length > 0 ? (
              <Section title="История погашений">
                <div className="space-y-1">
                  {historyQuery.data.payments.map((p) => (
                    <div key={p.id} className="rounded-xl border p-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-emerald-700">
                          {p.amount.toFixed(2)} сом
                        </span>
                        <span className="text-xs text-slate-500">
                          {p.created_at ? new Date(p.created_at).toLocaleString("ru-RU") : "—"}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {METHOD_LABEL[p.method] ?? p.method}
                        {p.created_by ? ` · ${p.created_by}` : ""}
                        {p.sale_id ? ` · к продаже #${p.sale_id}` : ""}
                      </div>
                      {p.comment ? <p className="mt-1 text-xs text-slate-700">{p.comment}</p> : null}
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Всего внесено:{" "}
                  <b>
                    {historyQuery.data.payments
                      .reduce((acc, p) => acc + p.amount, 0)
                      .toFixed(2)} сом
                  </b>
                </p>
              </Section>
            ) : null}


            <Section title="История покупок">
              {data.recent_purchases.length ? (
                <div className="space-y-1">
                  {data.recent_purchases.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-xl border p-2 text-sm">
                      <div>
                        <p>#{p.id}</p>
                        <p className="text-xs text-slate-500">{p.created_at.slice(0, 10)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{Number(p.total).toFixed(2)} сом</p>
                        <p className="text-xs text-slate-500">{SALE_STATUS_LABEL[p.status] ?? p.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Покупок ещё не было</p>
              )}
            </Section>

            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="mt-2 w-full rounded-xl border border-red-300 p-3 text-sm font-semibold text-red-600 disabled:opacity-50"
            >
              {deleteMutation.isPending ? "Удаление..." : "Удалить клиента"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">{title}</h3>
      {children}
    </div>
  );
}
