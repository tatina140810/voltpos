import { useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, RotateCcw, ScanLine, Trash2, Upload, X } from "lucide-react";

import { BarcodeScanner } from "../components/BarcodeScanner";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";
import { useBusinessSettings } from "../hooks/useBusinessSettings";

type ScanItem = {
  name: string;
  barcode: string | null;
  article: string | null;
  quantity: number;
  unit: string | null;
  price: number;
  total: number;
};

type ScanResult = {
  supplier: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  items: ScanItem[];
  total_amount: number | null;
};

type EditableRow = {
  id: string;  // локальный ключ
  name: string;
  barcode: string;
  quantity: string;
  price: string;
  matched_product_id: number | null;  // если найден товар по barcode
};

type Product = { id: number; name: string; barcode?: string; kind?: string };

// Парсер чисел с поддержкой запятой как десятичного разделителя.
// Anthropic / накладные / русская раскладка — везде запятая. Number("27,8") = NaN.
function parseNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

export function ScanInvoicePage() {
  const role = useAuthStore((s) => s.role);
  const { hasInvoiceScan } = useBusinessSettings();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [supplier, setSupplier] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveProgress, setSaveProgress] = useState<string | null>(null);
  // id строки, для которой сейчас открыт сканер штрихкода. null — закрыт.
  const [scanningRowId, setScanningRowId] = useState<string | null>(null);

  // Если у магазина фича не подключена — отправляем подальше.
  if (!hasInvoiceScan) {
    return <Navigate to="/sale" replace />;
  }
  if (role !== "owner" && role !== "warehouse") {
    return <Navigate to="/sale" replace />;
  }

  const productsQuery = useQuery({
    queryKey: ["products-all"],
    queryFn: async () => (await api.get("/products")).data as Product[],
  });

  const quotaQuery = useQuery({
    queryKey: ["scan-quota"],
    queryFn: async () => (await api.get("/scan/quota")).data as {
      enabled: boolean;
      used: number;
      limit: number;
      year_month: string;
    },
  });

  const handleFile = (f: File | null) => {
    setError(null);
    setRows([]);
    setSupplier("");
    setInvoiceNumber("");
    setInvoiceDate("");
    if (!f) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (!f.type.startsWith("image/")) {
      setError("Нужно изображение (jpg, png, webp)");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("Файл больше 5 МБ");
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const scanMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("no file");
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post<ScanResult>("/scan/invoice", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["scan-quota"] });
      setSupplier(data.supplier ?? "");
      setInvoiceNumber(data.invoice_number ?? "");
      setInvoiceDate(data.invoice_date ?? "");
      // Двухступенчатое сопоставление с базой товаров:
      //   1) штрихкод совпал → берём ИМЯ из базы (ИИ может прочитать криво «1Л СУЛТАН-ЧАЙ ЗЕДЛ»);
      //   2) штрихкода нет / не нашли, но ИМЯ совпало → подставляем ШТРИХКОД из базы.
      // Так не плодим дублирующие товары.
      const products = productsQuery.data ?? [];
      const byBarcode = new Map<string, Product>();
      const byName = new Map<string, Product>();
      const norm = (s: string) =>
        s.toLowerCase()
          .replace(/[«»"',.;:!?()/\\-]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      for (const p of products) {
        if (p.barcode) byBarcode.set(p.barcode, p);
        if (p.name) byName.set(norm(p.name), p);
      }
      setRows(
        (data.items ?? []).map((it, idx) => {
          const rawBarcode = (it.barcode ?? "").trim();
          const rawName = (it.name ?? "").trim();
          let matched: Product | undefined;
          // Шаг 1: матч по штрихкоду — ШК доминирует над названием.
          if (rawBarcode) matched = byBarcode.get(rawBarcode);
          // Шаг 2: если по ШК не нашли — пытаемся по нормализованному имени.
          if (!matched && rawName) matched = byName.get(norm(rawName));
          return {
            id: `${Date.now()}-${idx}`,
            // Если нашли — берём канонические поля из базы, чтобы не плодить дубли.
            name: matched ? matched.name : rawName,
            barcode: matched ? (matched.barcode ?? rawBarcode) : rawBarcode,
            quantity: String(it.quantity ?? 0),
            price: String(it.price ?? 0),
            matched_product_id: matched ? matched.id : null,
          };
        }),
      );
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setError(detail ?? "Не удалось распознать накладную");
    },
  });

  const updateRow = (id: string, patch: Partial<EditableRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  // При изменении штрихкода — снова ищем товар и подтягиваем каноничное имя.
  const onBarcodeBlur = (id: string, barcode: string) => {
    const products = productsQuery.data ?? [];
    const matched = barcode ? products.find((p) => p.barcode === barcode) : null;
    if (matched) {
      updateRow(id, { matched_product_id: matched.id, name: matched.name });
    } else {
      updateRow(id, { matched_product_id: null });
    }
  };

  const acceptMutation = useMutation({
    mutationFn: async () => {
      let createdMovements = 0;
      const failed: { id: string; row: number; name: string; reason: string }[] = [];
      const succeededIds: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        setSaveProgress(`Сохраняю ${i + 1} / ${rows.length}: ${row.name}…`);
        const qty = parseNum(row.quantity);
        const price = parseNum(row.price);
        if (qty <= 0) {
          failed.push({ id: row.id, row: i + 1, name: row.name, reason: "количество = 0" });
          continue;
        }
        if (price <= 0) {
          failed.push({ id: row.id, row: i + 1, name: row.name, reason: "цена = 0" });
          continue;
        }

        try {
          let productId = row.matched_product_id;
          // Если товар не найден — создаём новый. barcode обязательный для нового товара,
          // но мы можем сгенерировать (barcode_generated=true) если у юзера его нет.
          if (!productId) {
            const productPayload: Record<string, unknown> = {
              name: row.name || `Товар (без названия) ${i + 1}`,
              sale_price: price,  // дефолт = закупочная, юзер исправит позже
              purchase_price: price,
            };
            if (row.barcode) {
              productPayload.barcode = row.barcode;
            } else {
              productPayload.barcode_generated = true;
            }
            const created = (await api.post("/products", productPayload)).data as { id: number };
            productId = created.id;
          }

          // Если товар весовой — кол-во из накладной (например 27.8 кг) шлём в quantity_decimal,
          // иначе теряли бы дробную часть и склад отъезжал.
          const matchedProd = (productsQuery.data ?? []).find((p) => p.id === productId);
          const isWeighed = matchedProd?.kind === "weighed";
          await api.post("/stock/movement", {
            product_id: productId,
            quantity: isWeighed ? 0 : Math.max(1, Math.round(qty)),
            quantity_decimal: isWeighed ? qty : null,
            type: "in",
            cost_price: price,
            reason: `Приход по накладной${invoiceNumber ? " #" + invoiceNumber : ""}${supplier ? ", " + supplier : ""}`,
            supplier: supplier || null,
          });
          createdMovements++;
          succeededIds.push(row.id);
        } catch (err: unknown) {
          const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
          failed.push({ id: row.id, row: i + 1, name: row.name, reason: detail ?? "ошибка сохранения" });
        }
      }
      return { createdMovements, failed, succeededIds };
    },
    onSuccess: ({ createdMovements, failed, succeededIds }) => {
      setSaveProgress(null);
      setError(null);
      qc.invalidateQueries({ queryKey: ["products-all"] });
      qc.invalidateQueries({ queryKey: ["stock-summary"] });
      // Удаляем успешно сохранённые строки — чтобы повтор не создавал дублей.
      setRows((prev) => prev.filter((r) => !succeededIds.includes(r.id)));
      const okMsg = `✅ Принято в приход: ${createdMovements} позиций.`;
      if (failed.length === 0) {
        alert(okMsg);
        reset();
      } else {
        const lines = failed.map((f) => `  • «${f.name}» — ${f.reason}`).join("\n");
        alert(`${okMsg}\n\n⚠️ Не сохранены ${failed.length} позиций (исправь и нажми ещё раз):\n${lines}`);
      }
    },
    onError: (err: unknown) => {
      setSaveProgress(null);
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setError(detail ?? "Не удалось сохранить приход");
    },
  });

  const reset = () => {
    setFile(null);
    setPreviewUrl(null);
    setSupplier("");
    setInvoiceNumber("");
    setInvoiceDate("");
    setRows([]);
    setError(null);
    setSaveProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const totalSum = rows.reduce((acc, r) => acc + parseNum(r.quantity) * parseNum(r.price), 0);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ScanLine size={22} className="text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Сканирование накладной</h1>
            <p className="text-sm text-slate-500">
              Загрузи фото — ИИ распознает позиции, проверишь и одной кнопкой примешь в приход.
            </p>
          </div>
        </div>
        {quotaQuery.data ? (
          (() => {
            const { used, limit } = quotaQuery.data;
            const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
            const danger = used >= limit;
            const warn = used >= limit * 0.8 && used < limit;
            return (
              <div className={`min-w-[200px] rounded-xl border p-2 text-xs ${
                danger ? "border-red-300 bg-red-50" : warn ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
              }`}>
                <p className="mb-1">
                  <b>{used}</b> / {limit} сканов в этом месяце
                </p>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full ${danger ? "bg-red-500" : warn ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {danger ? (
                  <p className="mt-1 text-[10px] text-red-700">
                    Лимит исчерпан — обратись к владельцу платформы
                  </p>
                ) : null}
              </div>
            );
          })()
        ) : null}
      </div>

      {error ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        {/* Левая колонка: загрузка фото */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {!previewUrl ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                handleFile(f);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="flex h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-primary hover:text-primary"
            >
              <Upload size={32} className="mb-2" />
              <p className="text-sm font-semibold">Выбери или перетащи фото</p>
              <p className="mt-1 text-xs">JPG, PNG, WEBP — до 5 МБ</p>
            </div>
          ) : (
            <div>
              <img src={previewUrl} alt="накладная" className="max-h-[420px] w-full rounded-xl object-contain" />
              <button
                type="button"
                onClick={reset}
                className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
              >
                <X size={14} /> Убрать фото
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => scanMutation.mutate()}
            disabled={!file || scanMutation.isPending}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            <Camera size={16} />
            {scanMutation.isPending ? "Распознаём…" : "Распознать накладную"}
          </button>
        </div>

        {/* Правая колонка: результат */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">
              {scanMutation.isPending ? "Распознаём накладную, может занять до минуты…" : "После распознавания позиции появятся здесь."}
            </p>
          ) : (
            <>
              <div className="mb-3 grid gap-2 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Поставщик</span>
                  <input
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    placeholder="—"
                    className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">№ накладной</span>
                  <input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="—"
                    className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">Дата</span>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm"
                  />
                </label>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Название</th>
                      <th className="px-2 py-2">Штрихкод</th>
                      <th className="px-2 py-2 text-right">Кол-во</th>
                      <th className="px-2 py-2 text-right">Цена</th>
                      <th className="px-2 py-2 text-right">Сумма</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="px-1 py-1">
                          <input
                            value={row.name}
                            onChange={(e) => updateRow(row.id, { name: e.target.value })}
                            className="h-8 w-full rounded border border-slate-300 px-2 text-sm"
                          />
                          {row.matched_product_id ? (
                            <span className="ml-1 text-[10px] text-emerald-600">✓ есть в базе</span>
                          ) : (
                            <span className="ml-1 text-[10px] text-amber-600">+ создастся новый</span>
                          )}
                        </td>
                        <td className="px-1 py-1">
                          <div className="flex items-center gap-1">
                            <input
                              value={row.barcode}
                              onChange={(e) => updateRow(row.id, { barcode: e.target.value })}
                              onBlur={(e) => onBarcodeBlur(row.id, e.target.value.trim())}
                              placeholder="—"
                              className="h-8 w-28 rounded border border-slate-300 px-2 font-mono text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => setScanningRowId(row.id)}
                              className="flex h-8 w-8 items-center justify-center rounded border border-slate-300 text-slate-500 hover:border-primary hover:text-primary"
                              title="Сканировать штрихкод камерой"
                            >
                              <Camera size={14} />
                            </button>
                          </div>
                        </td>
                        <td className="px-1 py-1 text-right">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.quantity}
                            onChange={(e) => updateRow(row.id, { quantity: e.target.value })}
                            className="h-8 w-20 rounded border border-slate-300 px-2 text-right tabular-nums"
                          />
                        </td>
                        <td className="px-1 py-1 text-right">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.price}
                            onChange={(e) => updateRow(row.id, { price: e.target.value })}
                            className="h-8 w-24 rounded border border-slate-300 px-2 text-right tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums font-semibold">
                          {(parseNum(row.quantity) * parseNum(row.price)).toFixed(2)}
                        </td>
                        <td className="px-1 py-1">
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            title="Удалить строку"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-slate-50">
                      <td colSpan={4} className="px-2 py-2 text-right text-sm font-semibold text-slate-700">
                        ИТОГО
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-base font-bold">
                        {totalSum.toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {saveProgress ? (
                <p className="mt-2 text-xs text-slate-500">{saveProgress}</p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => acceptMutation.mutate()}
                  disabled={acceptMutation.isPending || rows.length === 0}
                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Check size={16} />
                  {acceptMutation.isPending ? "Сохраняю…" : "Принять в приход"}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                >
                  <RotateCcw size={16} /> Сбросить
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Модалка сканера штрихкода для строки накладной. */}
      {scanningRowId !== null ? (
        <div className="fixed inset-0 z-[80] bg-black">
          <BarcodeScanner
            onDetected={(code) => {
              const trimmed = (code || "").trim();
              if (!trimmed) return { ok: false, message: "Пустой код", autoClose: false };
              const products = productsQuery.data ?? [];
              const matched = products.find((p) => p.barcode === trimmed);
              updateRow(scanningRowId, {
                barcode: trimmed,
                matched_product_id: matched ? matched.id : null,
                // Если нашли — заменяем название на каноничное (из базы), иначе оставляем как было.
                ...(matched ? { name: matched.name } : {}),
              });
              setScanningRowId(null);
              return matched
                ? { ok: true, message: `✓ Найден: ${matched.name}`, autoClose: true }
                : { ok: true, message: `✓ ${trimmed} (создастся новый товар)`, autoClose: true };
            }}
            onClose={() => setScanningRowId(null)}
          />
        </div>
      ) : null}
    </div>
  );
}
