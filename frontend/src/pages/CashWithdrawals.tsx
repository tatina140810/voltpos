import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { NumberInput } from "../components/NumberInput";
import { api } from "../lib/api";

type Withdrawal = {
  id: number;
  recipient: string;
  amount: number | string;
  reason: string | null;
  issued_by_id: number;
  issued_by_name?: string | null;
  created_at: string;
};

type TodayTotal = { date: string; total: string };

export function CashWithdrawalsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const listQuery = useQuery({
    queryKey: ["cash-withdrawals"],
    queryFn: async () => (await api.get("/cash-withdrawals")).data as Withdrawal[],
  });

  const todayQuery = useQuery({
    queryKey: ["cash-withdrawals-today-total"],
    queryFn: async () => (await api.get("/cash-withdrawals/today/total")).data as TodayTotal,
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      api.post("/cash-withdrawals", {
        recipient: recipient.trim(),
        amount: Number(amount || 0),
        reason: reason.trim() || null,
      }),
    onSuccess: async () => {
      setShowForm(false);
      setRecipient("");
      setAmount("");
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["cash-withdrawals"] });
      await queryClient.invalidateQueries({ queryKey: ["cash-withdrawals-today-total"] });
    },
    onError: () => alert("Не удалось сохранить"),
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

  const canSubmit = recipient.trim().length > 0 && Number(amount) > 0 && !createMutation.isPending;

  return (
    <main>
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-semibold">Инкассация</h1>
        <button onClick={() => setShowForm(true)} className="rounded-xl bg-primary px-4 py-3 text-white">
          Выдать наличные
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow">
          <p className="text-xs text-slate-500">Выдано сегодня</p>
          <p className="text-3xl font-bold text-red-600">-{todayTotal.toFixed(2)} сом</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow md:col-span-2">
          <p className="text-xs text-slate-500">Всего записей в истории</p>
          <p className="text-3xl font-bold">{items.length}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow">
        <h2 className="mb-3 text-lg font-semibold">История выдач</h2>
        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-slate-500">Пока нет записей. Нажмите «Выдать наличные».</p>
          ) : (
            items.map((row) => {
              const dt = new Date(row.created_at);
              return (
                <div key={row.id} className="flex flex-col gap-1 rounded-xl border p-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <p className="font-semibold">{row.recipient}</p>
                      <p className="text-xl font-bold text-red-600">-{Number(row.amount).toFixed(2)} сом</p>
                    </div>
                    {row.reason ? <p className="text-sm text-slate-600">{row.reason}</p> : null}
                    <p className="text-xs text-slate-500">
                      {dt.toLocaleString()} · выдал: {row.issued_by_name ?? `#${row.issued_by_id}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Удалить запись о выдаче ${Number(row.amount).toFixed(2)} сом?`)) {
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
        <div className="fixed inset-0 z-40 bg-black/40 p-4">
          <div className="mx-auto max-w-md rounded-2xl bg-white p-4">
            <h2 className="mb-3 text-xl font-semibold">Выдача наличных</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Кому выдано</label>
                <input
                  className="w-full rounded-xl border p-3"
                  placeholder="Имя получателя"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  autoFocus
                />
              </div>
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
                <label className="mb-1 block text-xs text-slate-500">Причина / Комментарий</label>
                <input
                  className="w-full rounded-xl border p-3"
                  placeholder="Например: на закупку, текущие расходы"
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
