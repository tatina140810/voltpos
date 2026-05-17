import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Package, Trash2, Wallet, Check, X, ChevronDown } from "lucide-react";

import { NumberInput } from "../components/NumberInput";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";

type Method = "cash" | "card" | "transfer";

type OrderSummary = {
  id: number;
  customer_id: number;
  customer_name: string | null;
  title: string;
  notes: string | null;
  total_expected: string | null;
  status: "open" | "fulfilled" | "cancelled";
  created_at: string | null;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  sale_id: number | null;
  paid_cash: string;
  paid_card: string;
  paid_transfer: string;
  paid_total: string;
  remaining: string | null;
};

type Customer = { id: number; name: string; phone: string };
type Product = { id: number; name: string; barcode?: string; sale_price?: number };

const METHOD_LABEL: Record<Method, string> = {
  cash: "💵 Наличными",
  card: "💳 Картой",
  transfer: "📱 Переводом",
};

function fmt(v: string | number | null): string {
  if (v === null || v === undefined) return "—";
  return Number(v || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function OrdersPage() {
  const role = useAuthStore((s) => s.role);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"open" | "fulfilled" | "cancelled">("open");
  const [showCreate, setShowCreate] = useState(false);
  const [activeOrder, setActiveOrder] = useState<OrderSummary | null>(null);
  const [actionMode, setActionMode] = useState<"add_payment" | "fulfill" | null>(null);

  const ordersQuery = useQuery({
    queryKey: ["orders", tab],
    queryFn: async () => (await api.get(`/orders?status=${tab}`)).data as OrderSummary[],
  });

  const orders = ordersQuery.data ?? [];

  return (
    <main className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">📦 Заказы клиентов</h1>
          <p className="text-sm text-slate-500">
            Предоплата за товар, который привезут позже. Выдача = создание реальной продажи.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          <Plus size={16} /> Принять предоплату
        </button>
      </div>

      <div className="mb-3 flex gap-2 border-b">
        {(["open", "fulfilled", "cancelled"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm ${
              tab === t
                ? "border-b-2 border-primary font-semibold text-primary"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t === "open" ? "🕓 Открытые" : t === "fulfilled" ? "✅ Выданные" : "❌ Отменённые"}
          </button>
        ))}
      </div>

      {ordersQuery.isLoading ? (
        <p className="text-sm text-slate-500">Загрузка…</p>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          {tab === "open" ? "Нет открытых заказов." : tab === "fulfilled" ? "Нет выданных." : "Нет отменённых."}
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-base font-semibold text-slate-800">
                    #{o.id} · {o.title}
                  </p>
                  <p className="text-xs text-slate-500">
                    Клиент: <b>{o.customer_name ?? "—"}</b> · создан {fmtDate(o.created_at)}
                  </p>
                  {o.notes ? <p className="mt-1 text-xs text-slate-600">📝 {o.notes}</p> : null}
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500">
                    Внесено: <b>{fmt(o.paid_total)} сом</b>
                  </p>
                  {o.total_expected ? (
                    <p className="text-xs text-slate-500">
                      Ожидаем: {fmt(o.total_expected)} · остаток <b>{fmt(o.remaining)}</b>
                    </p>
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-slate-500">
                нал {fmt(o.paid_cash)} · карта {fmt(o.paid_card)} · перевод {fmt(o.paid_transfer)}
              </p>
              {o.sale_id ? (
                <p className="mt-1 text-xs text-emerald-700">✅ Создана продажа #{o.sale_id}</p>
              ) : null}
              {o.status === "open" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => { setActiveOrder(o); setActionMode("add_payment"); }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1 text-xs hover:border-primary hover:text-primary"
                  >
                    <Wallet size={14} /> Внести ещё
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveOrder(o); setActionMode("fulfill"); }}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <Check size={14} /> Выдать товар
                  </button>
                  {role === "owner" ? (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm("Отменить заказ? Предоплата вернётся клиенту.")) return;
                        try {
                          await api.post(`/orders/${o.id}/cancel`, {});
                          qc.invalidateQueries({ queryKey: ["orders"] });
                        } catch (err) {
                          alert("Не удалось отменить");
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50"
                    >
                      <X size={14} /> Отменить
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {showCreate ? (
        <CreateOrderModal onClose={() => setShowCreate(false)} onCreated={() => qc.invalidateQueries({ queryKey: ["orders"] })} />
      ) : null}
      {activeOrder && actionMode === "add_payment" ? (
        <AddPaymentModal
          order={activeOrder}
          onClose={() => { setActiveOrder(null); setActionMode(null); }}
          onSaved={() => qc.invalidateQueries({ queryKey: ["orders"] })}
        />
      ) : null}
      {activeOrder && actionMode === "fulfill" ? (
        <FulfillModal
          order={activeOrder}
          onClose={() => { setActiveOrder(null); setActionMode(null); }}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["orders"] });
            qc.invalidateQueries({ queryKey: ["stock-summary"] });
          }}
        />
      ) : null}
    </main>
  );
}

// ============= Создание заказа =============

function CreateOrderModal({ onClose, onCreated }: { onClose: () => void; onDone?: () => void; onCreated: () => void }) {
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [totalExpected, setTotalExpected] = useState("");
  const [firstAmount, setFirstAmount] = useState("");
  const [firstMethod, setFirstMethod] = useState<Method>("cash");

  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: async () => (await api.get("/customers")).data as Customer[],
  });

  const customers = customersQuery.data ?? [];
  const filtered = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 5);
    const q = customerSearch.trim().toLowerCase();
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)).slice(0, 10);
  }, [customers, customerSearch]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        customer_id: customerId,
        title: title.trim(),
        notes: notes.trim() || null,
        total_expected: totalExpected ? Number(String(totalExpected).replace(",", ".")) : null,
      };
      const amt = Number(String(firstAmount).replace(",", "."));
      if (amt > 0) {
        payload.first_payment = { amount: amt, method: firstMethod };
      }
      await api.post("/orders", payload);
    },
    onSuccess: () => {
      onCreated();
      onClose();
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      alert(detail ?? "Не удалось создать заказ");
    },
  });

  const canSubmit = customerId !== null && title.trim().length > 0 && !createMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-auto" onClick={onClose}>
      <div className="mt-8 w-full max-w-md rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-semibold">Принять предоплату</h3>
        <div className="space-y-3 text-sm">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Клиент *</label>
            <input
              type="text"
              value={customerSearch}
              onChange={(e) => { setCustomerSearch(e.target.value); setCustomerId(null); }}
              placeholder="Поиск по имени или телефону…"
              className="h-11 w-full rounded-xl border border-slate-300 px-3"
            />
            {!customerId && filtered.length > 0 ? (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setCustomerId(c.id); setCustomerSearch(c.name); }}
                    className="block w-full border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                  >
                    <span className="font-semibold">{c.name}</span> <span className="text-xs text-slate-500">{c.phone}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {customerId ? (
              <p className="mt-1 text-xs text-emerald-700">✓ выбран клиент #{customerId}</p>
            ) : null}
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Что заказали *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Холодильник Samsung RB37"
              className="h-11 w-full rounded-xl border border-slate-300 px-3"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Комментарий (необязательно)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Цвет, размер, срок поставки…"
              className="h-11 w-full rounded-xl border border-slate-300 px-3"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Ожидаемая полная сумма (если известна)</label>
            <NumberInput value={totalExpected} onChange={setTotalExpected} placeholder="0" className="h-11 w-full rounded-xl border border-slate-300 px-3" />
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="mb-2 text-xs font-semibold text-emerald-800">Первая предоплата (опционально)</p>
            <div className="grid grid-cols-2 gap-2">
              <NumberInput value={firstAmount} onChange={setFirstAmount} placeholder="Сумма" className="h-10 w-full rounded-lg border border-slate-300 px-3" />
              <select
                value={firstMethod}
                onChange={(e) => setFirstMethod(e.target.value as Method)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"
              >
                {(Object.entries(METHOD_LABEL) as [Method, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit}
            className="flex-1 rounded-xl bg-primary p-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {createMutation.isPending ? "Создаю…" : "Создать заказ"}
          </button>
          <button type="button" onClick={onClose} className="rounded-xl border px-4 py-3 text-sm">Отмена</button>
        </div>
      </div>
    </div>
  );
}

// ============= Добавить платёж =============

function AddPaymentModal({ order, onClose, onSaved }: { order: OrderSummary; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const mut = useMutation({
    mutationFn: async () => {
      await api.post(`/orders/${order.id}/payments`, {
        amount: Number(String(amount).replace(",", ".")) || 0,
        method,
      });
    },
    onSuccess: () => { onSaved(); onClose(); },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      alert(detail ?? "Не удалось");
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-semibold">Внести предоплату</h3>
        <p className="mb-3 text-sm text-slate-600">
          Заказ <b>#{order.id} {order.title}</b>
          <br />
          Уже внесено: <b>{fmt(order.paid_total)} сом</b>
        </p>
        <div className="space-y-2">
          <NumberInput value={amount} onChange={setAmount} placeholder="Сумма" className="h-11 w-full rounded-xl border px-3" />
          <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className="h-11 w-full rounded-xl border bg-white px-3 text-sm">
            {(Object.entries(METHOD_LABEL) as [Method, string][]).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
          </select>
        </div>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => mut.mutate()} disabled={!amount || mut.isPending} className="flex-1 rounded-xl bg-emerald-600 p-3 text-sm font-semibold text-white disabled:opacity-50">
            {mut.isPending ? "Сохраняю…" : "Внести"}
          </button>
          <button type="button" onClick={onClose} className="rounded-xl border px-4 py-3 text-sm">Отмена</button>
        </div>
      </div>
    </div>
  );
}

// ============= Выдача заказа =============

type FulfillRow = { product_id: number; product_name: string; barcode?: string; quantity: string; price: string };

function FulfillModal({ order, onClose, onDone }: { order: OrderSummary; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<FulfillRow[]>([]);
  const [search, setSearch] = useState("");
  const [extraCash, setExtraCash] = useState("");
  const [extraCard, setExtraCard] = useState("");
  const [extraTransfer, setExtraTransfer] = useState("");

  const productsQuery = useQuery({
    queryKey: ["products-all"],
    queryFn: async () => (await api.get("/products")).data as Product[],
  });

  const products = productsQuery.data ?? [];
  const filtered = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q) || (p.barcode || "").includes(q)).slice(0, 8);
  }, [products, search]);

  const itemsTotal = rows.reduce((acc, r) => acc + (Number(r.quantity) || 0) * (Number(String(r.price).replace(",", ".")) || 0), 0);
  const prepaidTotal = Number(order.paid_total) || 0;
  const extraTotal = (Number(extraCash) || 0) + (Number(extraCard) || 0) + (Number(extraTransfer) || 0);
  const remaining = Math.max(0, itemsTotal - prepaidTotal);
  const enough = prepaidTotal + extraTotal >= itemsTotal && rows.length > 0;

  const mut = useMutation({
    mutationFn: async () => {
      await api.post(`/orders/${order.id}/fulfill`, {
        items: rows.map((r) => ({
          product_id: r.product_id,
          quantity: Math.max(1, Math.floor(Number(r.quantity) || 0)),
          price: Number(String(r.price).replace(",", ".")) || 0,
        })),
        extra_cash: Number(extraCash) || 0,
        extra_card: Number(extraCard) || 0,
        extra_transfer: Number(extraTransfer) || 0,
      });
    },
    onSuccess: () => { onDone(); onClose(); alert("✅ Заказ выдан, продажа создана"); },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      alert(detail ?? "Не удалось выдать");
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-auto" onClick={onClose}>
      <div className="mt-4 w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-2 text-lg font-semibold">Выдать заказ #{order.id}</h3>
        <p className="mb-3 text-sm text-slate-600">{order.title} · {order.customer_name}</p>

        <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Найти товар по названию или штрихкоду…"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
          />
          {filtered.length > 0 ? (
            <div className="mt-2 max-h-40 overflow-y-auto rounded border bg-white">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setRows((prev) => [
                      ...prev,
                      {
                        product_id: p.id,
                        product_name: p.name,
                        barcode: p.barcode,
                        quantity: "1",
                        price: String(p.sale_price ?? 0),
                      },
                    ]);
                    setSearch("");
                  }}
                  className="block w-full border-b px-3 py-2 text-left text-xs last:border-b-0 hover:bg-slate-50"
                >
                  <span className="font-medium">{p.name}</span>{" "}
                  <span className="text-slate-500">{p.barcode ?? ""} · {fmt(p.sale_price ?? 0)} сом</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">Добавь товары из базы.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-1 py-1">Товар</th>
                <th className="px-1 py-1">Кол-во</th>
                <th className="px-1 py-1">Цена</th>
                <th className="px-1 py-1">Сумма</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx} className="border-t">
                  <td className="px-1 py-1">{r.product_name}</td>
                  <td className="px-1 py-1">
                    <input type="text" inputMode="numeric" value={r.quantity}
                      onChange={(e) => setRows((prev) => prev.map((p, i) => i === idx ? { ...p, quantity: e.target.value } : p))}
                      className="h-7 w-14 rounded border px-1 text-right" />
                  </td>
                  <td className="px-1 py-1">
                    <input type="text" inputMode="decimal" value={r.price}
                      onChange={(e) => setRows((prev) => prev.map((p, i) => i === idx ? { ...p, price: e.target.value } : p))}
                      className="h-7 w-20 rounded border px-1 text-right" />
                  </td>
                  <td className="px-1 py-1 text-right font-semibold tabular-nums">
                    {fmt((Number(r.quantity) || 0) * (Number(String(r.price).replace(",", ".")) || 0))}
                  </td>
                  <td className="px-1 py-1">
                    <button onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))} className="text-red-600">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-3 space-y-1 rounded-xl border bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><span>Сумма товаров:</span> <b>{fmt(itemsTotal)} сом</b></div>
          <div className="flex justify-between text-emerald-700"><span>Предоплата:</span> <b>−{fmt(prepaidTotal)} сом</b></div>
          <div className="flex justify-between font-semibold"><span>К доплате:</span> <b>{fmt(remaining)} сом</b></div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <label>
            <span className="block text-slate-500">Нал</span>
            <NumberInput value={extraCash} onChange={setExtraCash} placeholder="0" className="h-9 w-full rounded border px-2 text-right" />
          </label>
          <label>
            <span className="block text-slate-500">Карта</span>
            <NumberInput value={extraCard} onChange={setExtraCard} placeholder="0" className="h-9 w-full rounded border px-2 text-right" />
          </label>
          <label>
            <span className="block text-slate-500">Перевод</span>
            <NumberInput value={extraTransfer} onChange={setExtraTransfer} placeholder="0" className="h-9 w-full rounded border px-2 text-right" />
          </label>
        </div>

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => mut.mutate()} disabled={!enough || mut.isPending}
            className="flex-1 rounded-xl bg-emerald-600 p-3 text-sm font-semibold text-white disabled:opacity-50">
            {mut.isPending ? "Создаю продажу…" : "Завершить и выдать"}
          </button>
          <button type="button" onClick={onClose} className="rounded-xl border px-4 py-3 text-sm">Закрыть</button>
        </div>
      </div>
    </div>
  );
}
