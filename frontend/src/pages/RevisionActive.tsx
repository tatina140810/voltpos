import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, ClipboardList, Minus, Plus, Search, X } from "lucide-react";

import { BarcodeScanner } from "../components/BarcodeScanner";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";

type Product = { id: number; name: string; barcode?: string; kind?: string };

type RevisionItem = {
  id: number;
  product_id: number;
  product_name: string;
  barcode: string | null;
  expected_qty: string;
  actual_qty: string;
  counted_by: number | null;
  counted_by_name: string | null;
  updated_at: string | null;
};

type RevisionDetails = {
  id: number;
  status: "active" | "completed";
  items: RevisionItem[];
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function parseNum(v: string): number {
  if (!v) return 0;
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

export function RevisionActivePage() {
  const role = useAuthStore((s) => s.role);
  const myId = useAuthStore((s) => {
    // role известен, но id юзера лежит в JWT — парсим.
    const tk = s.token;
    if (!tk) return null;
    try { return Number(JSON.parse(atob(tk.split(".")[1])).sub); } catch { return null; }
  });
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [actualQty, setActualQty] = useState("0");
  const [scanning, setScanning] = useState(false);
  const [showCounted, setShowCounted] = useState(true);

  if (role !== "owner" && role !== "warehouse") {
    return <Navigate to="/sale" replace />;
  }

  const activeQuery = useQuery({
    queryKey: ["revisions-active"],
    queryFn: async () => (await api.get("/revisions/active")).data as { revision: { id: number } | null },
  });
  const revisionId = activeQuery.data?.revision?.id ?? null;

  const detailsQuery = useQuery({
    queryKey: ["revision-details", revisionId],
    enabled: revisionId !== null,
    queryFn: async () => (await api.get(`/revisions/${revisionId}`)).data as RevisionDetails,
    refetchInterval: 30000,  // автообновление каждые 30 сек чтобы видеть коллег
  });

  const productsQuery = useQuery({
    queryKey: ["products-all"],
    queryFn: async () => (await api.get("/products")).data as Product[],
  });

  const upsertMutation = useMutation({
    mutationFn: async ({ productId, qty }: { productId: number; qty: number }) => {
      await api.post(`/revisions/${revisionId}/items`, { product_id: productId, actual_qty: qty });
    },
    onSuccess: () => {
      setSelected(null);
      setActualQty("0");
      setSearch("");
      qc.invalidateQueries({ queryKey: ["revision-details", revisionId] });
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      alert(detail ?? "Не удалось сохранить");
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => (await api.post(`/revisions/${revisionId}/complete`, {})).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revisions-list"] });
      qc.invalidateQueries({ queryKey: ["revisions-active"] });
      qc.invalidateQueries({ queryKey: ["stock-summary"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      alert("Ревизия завершена. Остатки обновлены.");
      navigate(`/revisions/${revisionId}/report`);
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      alert(detail ?? "Не удалось завершить ревизию");
    },
  });

  const products = productsQuery.data ?? [];
  const items = detailsQuery.data?.items ?? [];
  const countedIds = new Set(items.map((i) => i.product_id));

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.includes(q.replace(/\s/g, ""))),
      )
      .slice(0, 10);
  }, [products, search]);

  const notCounted = useMemo(
    () => products.filter((p) => !countedIds.has(p.id)),
    [products, countedIds],
  );

  if (activeQuery.isLoading) {
    return <p className="p-6 text-sm text-slate-500">Загрузка…</p>;
  }
  if (!revisionId) {
    return (
      <main className="mx-auto max-w-2xl p-4 text-center">
        <ClipboardList size={32} className="mx-auto mb-2 text-slate-400" />
        <p className="mb-3 text-sm text-slate-700">Активной ревизии нет.</p>
        <button
          type="button"
          onClick={() => navigate("/revisions")}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
        >
          К списку ревизий
        </button>
      </main>
    );
  }

  const onScanned = (code: string) => {
    const trimmed = (code || "").trim();
    const p = products.find((x) => x.barcode === trimmed);
    setScanning(false);
    if (p) {
      setSelected(p);
      setActualQty(String(items.find((i) => i.product_id === p.id)?.actual_qty ?? "0"));
      return { ok: true, message: `✓ ${p.name}`, autoClose: true };
    }
    return { ok: false, message: `Не найден: ${trimmed}`, autoClose: false };
  };

  const inc = () => setActualQty((v) => String(parseNum(v) + 1));
  const dec = () => setActualQty((v) => String(Math.max(0, parseNum(v) - 1)));

  return (
    <main className="mx-auto max-w-3xl p-3">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Ревизия #{revisionId}</h1>
        {role === "owner" ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Завершить ревизию? После этого остатки на складе будут пересчитаны и редактировать нельзя.")) {
                completeMutation.mutate();
              }
            }}
            disabled={completeMutation.isPending}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {completeMutation.isPending ? "Завершаю…" : "✅ Завершить"}
          </button>
        ) : null}
      </div>

      {/* Поиск + сканер */}
      <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2">
            <Search size={16} className="text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Название или штрихкод…"
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
            {search ? (
              <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setScanning(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-primary hover:bg-indigo-50"
            title="Сканер"
          >
            <Camera size={18} />
          </button>
        </div>
        {filteredProducts.length > 0 && !selected ? (
          <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-200">
            {filteredProducts.map((p) => {
              const counted = items.find((i) => i.product_id === p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelected(p);
                    setActualQty(counted ? String(counted.actual_qty) : "0");
                  }}
                  className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.barcode ?? "—"}</p>
                  </div>
                  {counted ? (
                    <span className="text-[10px] text-emerald-600">✓ {counted.actual_qty}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Форма ввода количества */}
      {selected ? (
        <div className="mb-3 rounded-2xl border-2 border-primary/40 bg-white p-4 shadow-md">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-800">{selected.name}</h2>
              <p className="text-xs font-mono text-slate-500">{selected.barcode ?? "—"}</p>
              {(() => {
                const it = items.find((i) => i.product_id === selected.id);
                if (!it) return <p className="mt-1 text-xs text-slate-500">Ещё не считали</p>;
                if (it.counted_by !== myId) {
                  return (
                    <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
                      ⚠ Уже посчитал {it.counted_by_name ?? "коллега"} ({it.actual_qty}, в {fmt(it.updated_at)}).
                      Перезаписать?
                    </p>
                  );
                }
                return <p className="mt-1 text-xs text-slate-500">Ты посчитал: {it.actual_qty}</p>;
              })()}
            </div>
            <button
              onClick={() => { setSelected(null); setActualQty("0"); }}
              className="text-2xl text-slate-400"
            >
              ×
            </button>
          </div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Фактически на складе</p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={dec}
              className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-2xl font-bold text-slate-700 active:bg-slate-200"
            >
              <Minus size={28} />
            </button>
            <input
              type="text"
              inputMode="decimal"
              value={actualQty}
              onChange={(e) => setActualQty(e.target.value)}
              className="h-14 w-32 rounded-xl border-2 border-slate-300 text-center text-2xl font-bold tabular-nums focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={inc}
              className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-2xl font-bold text-slate-700 active:bg-slate-200"
            >
              <Plus size={28} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => upsertMutation.mutate({ productId: selected.id, qty: parseNum(actualQty) })}
            disabled={upsertMutation.isPending}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            <Check size={20} />
            {upsertMutation.isPending ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      ) : null}

      {/* Уже посчитано */}
      <div className="mb-2 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setShowCounted((v) => !v)}
          className="flex w-full items-center justify-between border-b px-4 py-2 text-sm font-semibold text-slate-700"
        >
          <span>✅ Подсчитано: {items.length}</span>
          <span>{showCounted ? "▾" : "▸"}</span>
        </button>
        {showCounted ? (
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">Пока ничего не считали.</p>
            ) : (
              items.map((it) => {
                const delta = parseNum(it.actual_qty) - parseNum(it.expected_qty);
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => {
                      const p = products.find((pp) => pp.id === it.product_id);
                      if (p) {
                        setSelected(p);
                        setActualQty(it.actual_qty);
                      }
                    }}
                    className="flex w-full items-start justify-between border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-medium">{it.product_name}</p>
                      <p className="text-xs text-slate-500">
                        учёт: {it.expected_qty} · факт: <b>{it.actual_qty}</b>
                        {it.counted_by_name ? ` · ${it.counted_by_name}` : ""}
                      </p>
                    </div>
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${
                        delta === 0
                          ? "bg-emerald-100 text-emerald-700"
                          : delta > 0
                          ? "bg-blue-100 text-blue-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        ) : null}
      </div>

      {/* Не подсчитано */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b px-4 py-2 text-sm font-semibold text-slate-700">
          ⏳ Осталось подсчитать: {notCounted.length}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notCounted.length === 0 ? (
            <p className="p-3 text-center text-sm text-slate-500">Все товары посчитаны 🎉</p>
          ) : (
            notCounted.slice(0, 50).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSelected(p);
                  setActualQty("0");
                }}
                className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
              >
                <span>{p.name}</span>
                <span className="text-xs text-slate-400">{p.barcode ?? "—"}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Сканер на весь экран */}
      {scanning ? (
        <div className="fixed inset-0 z-[80] bg-black">
          <BarcodeScanner onDetected={onScanned} onClose={() => setScanning(false)} />
        </div>
      ) : null}
    </main>
  );
}
