import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { NumberInput } from "../components/NumberInput";
import { api } from "../lib/api";

type Installment = {
  id: number;
  customer_id: number;
  total_amount: number;
  paid_amount: number;
  next_payment_date: string;
  status: "active" | "completed" | "overdue";
  customer_name?: string;
};

export function InstallmentsPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "transfer">("cash");
  const queryClient = useQueryClient();

  const installmentsQuery = useQuery({
    queryKey: ["installments"],
    queryFn: async () => (await api.get("/installments")).data as Installment[],
  });

  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) return;
      await api.post(`/installments/${selectedId}/payment`, {
        amount: Number(amount),
        payment_method: method,
        paid_at: new Date().toISOString(),
      });
    },
    onSuccess: async () => {
      setSelectedId(null);
      setAmount("0");
      setMethod("cash");
      await queryClient.invalidateQueries({ queryKey: ["installments"] });
    },
  });

  const items = installmentsQuery.data ?? [];

  return (
    <main>
      <h1 className="mb-4 text-3xl font-semibold">Рассрочки и долги</h1>
      <div className="rounded-2xl bg-white p-4 shadow">
        <div className="space-y-2">
          {items.map((item) => {
            const debt = Number(item.total_amount) - Number(item.paid_amount);
            const overdue = item.status === "overdue";
            return (
              <div key={item.id} className={`rounded-xl border p-3 ${overdue ? "bg-red-50" : ""}`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold">{item.customer_name ?? `Клиент #${item.customer_id}`}</p>
                    <p className="text-sm text-slate-600">Следующий платёж: {item.next_payment_date}</p>
                    <p className="text-sm text-slate-600">Статус: {item.status}</p>
                  </div>
                  <div className="text-sm md:text-right">
                    <p>Долг: {debt.toFixed(2)} сом</p>
                    <p>Выплачено: {Number(item.paid_amount).toFixed(2)} сом</p>
                    <button
                      className="mt-2 rounded-lg bg-primary px-3 py-2 text-white"
                      onClick={() => setSelectedId(item.id)}
                    >
                      Внести платёж
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {!items.length ? <p className="text-sm text-slate-500">Рассрочки не найдены</p> : null}
        </div>
      </div>

      {selectedId ? (
        <div className="fixed inset-0 z-40 bg-black/40 p-4">
          <div className="mx-auto max-w-md rounded-2xl bg-white p-4">
            <h2 className="mb-3 text-xl font-semibold">Внести платёж</h2>
            <div className="space-y-3">
              <NumberInput
                className="w-full rounded-xl border p-3"
                value={amount}
                onChange={setAmount}
                placeholder="Сумма"
              />
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as "cash" | "card" | "transfer")}
                className="w-full rounded-xl border p-3"
              >
                <option value="cash">Наличные</option>
                <option value="card">Карта</option>
                <option value="transfer">Перевод</option>
              </select>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                className="flex-1 rounded-xl bg-primary p-3 text-white"
                onClick={() => paymentMutation.mutate()}
              >
                Сохранить
              </button>
              <button className="flex-1 rounded-xl border p-3" onClick={() => setSelectedId(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
