import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { NumberInput } from "../components/NumberInput";
import { api } from "../lib/api";

type Method = "cash" | "card" | "transfer";
type Kind = "inkas" | "owner" | "expense" | "supplier" | "other";

type Withdrawal = {
  id: number;
  recipient: string;
  amount: number | string;
  reason: string | null;
  method?: Method;
  kind?: Kind;
  supplier_id?: number | null;
  supplier_name?: string | null;
  issued_by_id: number;
  issued_by_name?: string | null;
  created_at: string;
};

type Supplier = { id: number; name: string };
type TodayTotal = { date: string; total: string };

const METHOD_LABEL: Record<Method, string> = {
  cash: "💵 Наличными",
  card: "💳 Картой",
  transfer: "📱 Переводом",
};
const KIND_LABEL: Record<Kind, string> = {
  inkas: "🏦 Инкассация в банк",
  owner: "👤 Выдача владельцу",
  expense: "📝 Текущий расход",
  supplier: "🏭 Оплата поставщику",
  other: "📦 Другое",
};

export function CashWithdrawalsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [kind, setKind] = useState<Kind>("expense");
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [supplierSearch, setSupplierSearch] = useState("");

  const listQuery = useQuery({
    queryKey: ["cash-withdrawals"],
    queryFn: async () => (await api.get("/cash-withdrawals")).data as Withdrawal[],
  });

  const suppliersQuery = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await api.get("/suppliers")).data as Supplier[],
  });

  const todayQuery = useQuery({
    queryKey: ["cash-withdrawals-today-total"],
    queryFn: async () => (await api.get("/cash-withdrawals/today/total")).data as TodayTotal,
  });

  const resetForm = () => {
    setShowForm(false);
    setRecipient("");
    setAmount("");
    setReason("");
    setMethod("cash");
    setKind("expense");
    setSupplierId(null);
    setSupplierSearch("");
  };

  const createMutation = useMutation({
    mutationFn: async () =>
      api.post("/cash-withdrawals", {
        recipient: recipient.trim(),
        amount: Number(String(amount).replace(",", ".")) || 0,
        reason: reason.trim() || null,
        method,
        kind,
        supplier_id: kind === "supplier" ? supplierId : null,
      }),
    onSuccess: async () => {
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["cash-withdrawals"] });
      await queryClient.invalidateQueries({ queryKey: ["cash-withdrawals-today-total"] });
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      alert(detail ?? "Не удалось сохранить");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/cash-withdrawals/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cash-withdrawals"] });
      await queryClient.invalidateQueries({ queryKey: ["cash-withdrawals-today-total"] });
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      alert(status === 403 ? "Удалять может только владелец" : "Не удалось удалить");
    },
  });

  const items = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const todayTotal = Number(todayQuery.data?.total ?? 0);

  // Когда юзер выбирает kind=supplier — пытаемся автоподобрать поставщика по введённому имени.
  const onSupplierSearchChange = (v: string) => {
    setSupplierSearch(v);
    const match = (suppliersQuery.data ?? []).find((s) => s.name === v);
    setSupplierId(match ? match.id : null);
    if (match) setRecipient(match.name);
  };

  const canSubmit =
    recipient.trim().length > 0 &&
    Number(String(amount).replace(",", ".")) > 0 &&
    !createMutation.isPending &&
    (kind !== "supplier" || supplierId !== null);

  return (
    <main>
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-semibold">Движение денег</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-xl bg-primary px-4 py-3 text-white"
        >
          + Новая запись
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow">
          <p className="text-xs text-slate-500">Выдано сегодня (все методы)</p>
          <p className="text-3xl font-bold text-red-600">−{todayTotal.toFixed(2)} сом</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow md:col-span-2">
          <p className="text-xs text-slate-500">Всего записей в истории</p>
          <p className="text-3xl font-bold">{items.length}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow">
        <h2 className="mb-3 text-lg font-semibold">История</h2>
        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-slate-500">Пока нет записей. Жми «+ Новая запись».</p>
          ) : (
            items.map((row) => {
              const dt = new Date(row.created_at);
              const m = (row.method ?? "cash") as Method;
              const k = (row.kind ?? "expense") as Kind;
              return (
                <div
                  key={row.id}
                  className="flex flex-col gap-1 rounded-xl border p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                        {KIND_LABEL[k]}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                        {METHOD_LABEL[m]}
                      </span>
                      <p className="font-semibold">
                        {row.supplier_name ?? row.recipient}
                      </p>
                      <p className="text-xl font-bold text-red-600">
                        −{Number(row.amount).toFixed(2)} сом
                      </p>
                    </div>
                    {row.reason ? <p className="mt-1 text-sm text-slate-600">{row.reason}</p> : null}
                    <p className="text-xs text-slate-500">
                      {dt.toLocaleString("ru-RU")} · выдал: {row.issued_by_name ?? `#${row.issued_by_id}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Удалить запись на ${Number(row.amount).toFixed(2)} сом?`)) {
                        deleteMutation.mutate(row.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="text-sm text-red-600 disabled:opacity-50 md:ml-3"
                    title="Удалить (только владелец)"
                  >
                    Удалить
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {showForm ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 overflow-auto">
          <div className="mt-8 w-full max-w-md rounded-2xl bg-white p-4">
            <h2 className="mb-3 text-xl font-semibold">Новая запись</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Категория</label>
                <select
                  className="w-full rounded-xl border bg-white p-3"
                  value={kind}
                  onChange={(e) => {
                    const k = e.target.value as Kind;
                    setKind(k);
                    if (k !== "supplier") {
                      setSupplierId(null);
                      setSupplierSearch("");
                    }
                  }}
                >
                  {(Object.entries(KIND_LABEL) as [Kind, string][]).map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Способ оплаты</label>
                <select
                  className="w-full rounded-xl border bg-white p-3"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as Method)}
                >
                  {(Object.entries(METHOD_LABEL) as [Method, string][]).map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
              </div>

              {kind === "supplier" ? (
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Поставщик</label>
                  <input
                    className="w-full rounded-xl border p-3"
                    list="cw-suppliers-list"
                    value={supplierSearch}
                    onChange={(e) => onSupplierSearchChange(e.target.value)}
                    placeholder="Начни вводить имя поставщика…"
                  />
                  <datalist id="cw-suppliers-list">
                    {(suppliersQuery.data ?? []).map((s) => (
                      <option key={s.id} value={s.name} />
                    ))}
                  </datalist>
                  {supplierSearch && !supplierId ? (
                    <p className="mt-1 text-xs text-amber-700">
                      Этого поставщика нет в базе. Сначала добавь его в разделе «Поставщики».
                    </p>
                  ) : null}
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Кому / на что</label>
                  <input
                    className="w-full rounded-xl border p-3"
                    placeholder="Имя получателя / описание"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    autoFocus
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs text-slate-500">Сумма (сом)</label>
                <NumberInput
                  className="w-full rounded-xl border p-3"
                  placeholder="0"
                  value={amount}
                  onChange={setAmount}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Комментарий (необязательно)</label>
                <input
                  className="w-full rounded-xl border p-3"
                  placeholder="Например: за молоко 12.05, без чека"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => createMutation.mutate()}
                disabled={!canSubmit}
                className="flex-1 rounded-xl bg-primary p-3 text-white disabled:opacity-50"
              >
                {createMutation.isPending ? "Сохранение..." : "Сохранить"}
              </button>
              <button className="flex-1 rounded-xl border p-3" onClick={resetForm}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
