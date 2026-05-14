import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { NumberInput } from "../components/NumberInput";
import { GroceryProductForm, GroceryFormState, groceryEmptyForm } from "../components/grocery/GroceryProductForm";
import { useBusinessSettings } from "../hooks/useBusinessSettings";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";

type Product = {
  id: number;
  name: string;
  description?: string;
  barcode?: string;
  category?: string | null;
  sale_price: number;
  purchase_price?: number;
  warranty_months?: number;
  min_stock?: number;
  kind?: "piece" | "weighed" | "volume";
  unit?: string | null;
  weighing_code?: string | null;
  shelf_life_days?: number | null;
  storage_temp?: string | null;
  country_of_origin?: string | null;
  manufacturer?: string | null;
  vat_rate?: number;
  min_days_before_expiry?: number;
  promo_price?: number | null;
  promo_until_date?: string | null;
  storage_location?: string | null;
  extra_barcodes?: string[] | null;
};

type OrgInfo = {
  id: number;
  name: string;
  has_weighed_products: boolean;
  weighed_code_length: number | null;
};

type StockRow = {
  product_id: number;
  balance: number;
};

type ProductForm = {
  name: string;
  description: string;
  sale_price: string;
  purchase_price: string;
  warranty_months: string;
  min_stock: string;
  barcode: string;
  extra_barcodes: string;  // через запятую/пробел/перенос
  kind: "piece" | "weighed";
  unit: string;
  weighing_code: string;
};

const emptyForm: ProductForm = {
  name: "",
  description: "",
  sale_price: "",
  purchase_price: "",
  warranty_months: "12",
  min_stock: "",
  barcode: "",
  extra_barcodes: "",
  kind: "piece",
  unit: "",
  weighing_code: "",
};

function parseExtraBarcodes(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ProductsPage() {
  const role = useAuthStore((s) => s.role);
  const isOwner = role === "owner";
  const queryClient = useQueryClient();
  const { type: businessType } = useBusinessSettings();
  const isGrocery = businessType === "grocery";

  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [groceryForm, setGroceryForm] = useState<GroceryFormState>(groceryEmptyForm);
  const [showStockIn, setShowStockIn] = useState(false);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockQty, setStockQty] = useState("1");
  const [stockPurchasePrice, setStockPurchasePrice] = useState("");
  const [stockSupplier, setStockSupplier] = useState("");
  const [stockExpiryDate, setStockExpiryDate] = useState("");
  const [stockBatch, setStockBatch] = useState("");
  const [message, setMessage] = useState("");

  const suppliersQuery = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await api.get("/suppliers")).data as { id: number; name: string }[],
  });

  const productsQuery = useQuery({
    queryKey: ["products-all"],
    queryFn: async () => (await api.get("/products")).data as Product[],
  });

  const orgQuery = useQuery({
    queryKey: ["org-me"],
    queryFn: async () => (await api.get("/org/me")).data as OrgInfo,
  });
  const orgHasWeighed = orgQuery.data?.has_weighed_products ?? false;

  const stockQuery = useQuery({
    queryKey: ["stock"],
    queryFn: async () => (await api.get("/stock")).data as StockRow[],
  });

  const saveProductMutation = useMutation({
    mutationFn: async () => {
      let payload: Record<string, unknown>;
      if (isGrocery) {
        payload = {
          name: groceryForm.name,
          description: groceryForm.description || null,
          category: groceryForm.category || null,
          sale_price: Number(groceryForm.sale_price || 0),
          purchase_price: Number(groceryForm.purchase_price || 0),
          warranty_months: 0,
          min_stock: Number(groceryForm.min_stock || 0),
          barcode: groceryForm.barcode || null,
          kind: groceryForm.kind,
          unit: groceryForm.unit || null,
          weighing_code: groceryForm.weighing_code || null,
          shelf_life_days: groceryForm.shelf_life_days ? Number(groceryForm.shelf_life_days) : null,
          storage_temp: groceryForm.storage_temp || null,
          country_of_origin: groceryForm.country_of_origin || null,
          manufacturer: groceryForm.manufacturer || null,
          vat_rate: Number(groceryForm.vat_rate || 0),
          min_days_before_expiry: Number(groceryForm.min_days_before_expiry || 0),
          promo_price: groceryForm.promo_price ? Number(groceryForm.promo_price) : null,
          promo_until_date: groceryForm.promo_until_date || null,
          storage_location: groceryForm.storage_location || null,
          supplier_id: groceryForm.supplier_id ?? null,
        };
      } else {
        payload = {
          name: form.name,
          description: form.description || null,
          sale_price: Number(form.sale_price || 0),
          purchase_price: Number(form.purchase_price || 0),
          warranty_months: Number(form.warranty_months || 0),
          min_stock: Number(form.min_stock || 0),
          barcode: form.barcode || null,
          extra_barcodes: parseExtraBarcodes(form.extra_barcodes),
        };
        if (orgHasWeighed) {
          payload.kind = form.kind;
          payload.unit = form.unit || null;
          payload.weighing_code = form.kind === "weighed" ? form.weighing_code || null : null;
        }
      }

      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload);
      } else {
        await api.post("/products", payload);
      }
    },
    onSuccess: async () => {
      setShowEditor(false);
      setEditingProduct(null);
      setForm(emptyForm);
      setGroceryForm(groceryEmptyForm);
      await queryClient.invalidateQueries({ queryKey: ["products-all"] });
      setMessage("Товар сохранён");
    },
    onError: () => setMessage("Не удалось сохранить товар"),
  });

  const generateBarcodeMutation = useMutation({
    mutationFn: async (productId: number) => {
      const response = await api.get(`/products/${productId}/barcode`);
      return response.data as { barcode?: string; code?: string };
    },
    onSuccess: (data) => {
      const barcode = data.barcode ?? data.code ?? "";
      setForm((prev) => ({ ...prev, barcode }));
      setMessage(barcode ? "Штрихкод сгенерирован" : "Штрихкод получен");
    },
    onError: () => setMessage("Не удалось сгенерировать штрихкод"),
  });

  const stockInMutation = useMutation({
    mutationFn: async () => {
      if (!stockProduct) return;
      const supTrim = isGrocery ? stockSupplier.trim() : "";
      const supId = supTrim
        ? (suppliersQuery.data ?? []).find((s) => s.name === supTrim)?.id ?? null
        : null;
      // Если поставщика ввели вручную — создадим его (тихо). Только для grocery.
      if (isGrocery && supTrim && !supId && isOwner) {
        try {
          await api.post("/suppliers", { name: supTrim });
          await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
        } catch {
          // не блокируем приход
        }
      }
      const isWeighed = (stockProduct as any)?.kind === "weighed";
      const qtyNum = Number(stockQty || 0);
      await api.post("/stock/movement", {
        product_id: stockProduct.id,
        quantity: isWeighed ? 0 : Math.floor(qtyNum),
        quantity_decimal: isWeighed ? Number(qtyNum.toFixed(3)) : null,
        type: "in",
        cost_price: Number(stockPurchasePrice || 0) || null,
        ...(isGrocery
          ? {
              supplier: supTrim || null,
              supplier_id: supId,
              expiry_date: stockExpiryDate || null,
              batch_number: stockBatch.trim() || null,
            }
          : {}),
      });
    },
    onSuccess: async () => {
      setShowStockIn(false);
      setStockProduct(null);
      setStockQty("1");
      setStockPurchasePrice("");
      setStockSupplier("");
      setStockExpiryDate("");
      setStockBatch("");
      await queryClient.invalidateQueries({ queryKey: ["stock"] });
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setMessage("Приход сохранён");
    },
    onError: () => setMessage("Не удалось сохранить приход"),
  });

  const products = productsQuery.data ?? [];
  const stock = stockQuery.data ?? [];
  const stockByProduct = useMemo(
    () => new Map(stock.map((row) => [row.product_id, row.balance])),
    [stock],
  );

  const rows = useMemo(
    () =>
      products
        .map((product) => ({ ...product, balance: stockByProduct.get(product.id) ?? 0 }))
        .filter((product) => product.name.toLowerCase().includes(search.toLowerCase())),
    [products, stockByProduct, search],
  );

  const openCreate = () => {
    setEditingProduct(null);
    setForm(emptyForm);
    setGroceryForm(groceryEmptyForm);
    setShowEditor(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name ?? "",
      description: product.description ?? "",
      sale_price: String(product.sale_price ?? 0),
      purchase_price: String(product.purchase_price ?? 0),
      warranty_months: String(product.warranty_months ?? 0),
      min_stock: String(product.min_stock ?? 0),
      barcode: product.barcode ?? "",
      extra_barcodes: (product.extra_barcodes ?? []).join(", "),
      kind: (product.kind ?? "piece") as "piece" | "weighed",
      unit: product.unit ?? "",
      weighing_code: product.weighing_code ?? "",
    });
    setGroceryForm({
      name: product.name ?? "",
      category: product.category ?? "",
      barcode: product.barcode ?? "",
      weighing_code: product.weighing_code ?? "",
      kind: (product.kind ?? "piece") as "piece" | "weighed" | "volume",
      unit: product.unit ?? "шт",
      sale_price: String(product.sale_price ?? 0),
      purchase_price: String(product.purchase_price ?? 0),
      vat_rate: String(product.vat_rate ?? 0),
      promo_price: product.promo_price != null ? String(product.promo_price) : "",
      promo_until_date: product.promo_until_date ?? "",
      shelf_life_days: product.shelf_life_days != null ? String(product.shelf_life_days) : "",
      min_days_before_expiry: String(product.min_days_before_expiry ?? 0),
      storage_temp: product.storage_temp ?? "",
      manufacturer: product.manufacturer ?? "",
      country_of_origin: product.country_of_origin ?? "",
      supplier_id: (product as { supplier_id?: number | null }).supplier_id ?? null,
      supplier_name:
        (suppliersQuery.data ?? []).find(
          (s) => s.id === ((product as { supplier_id?: number | null }).supplier_id ?? -1),
        )?.name ?? "",
      min_stock: String(product.min_stock ?? 1),
      storage_location: product.storage_location ?? "",
      description: product.description ?? "",
    });
    setShowEditor(true);
  };

  return (
    <main>
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-semibold">Товары</h1>
        <button onClick={openCreate} className="rounded-xl bg-primary px-4 py-3 text-white">
          Добавить товар
        </button>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию"
          className="mb-4 w-full rounded-xl border p-3"
        />
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="px-2 py-2">Название</th>
                {isOwner ? <th className="px-2 py-2">Закупка</th> : null}
                <th className="px-2 py-2">Цена продажи</th>
                <th className="px-2 py-2">Остаток</th>
                <th className="px-2 py-2">Гарантия</th>
                <th className="px-2 py-2">Штрихкод</th>
                <th className="px-2 py-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.id} className={idx % 2 ? "bg-slate-50" : ""}>
                  <td className="px-2 py-2">
                    <button onClick={() => setSelectedProduct(row)} className="text-left font-medium text-primary">
                      {row.name}
                    </button>
                  </td>
                  {isOwner ? <td className="px-2 py-2">{Number(row.purchase_price ?? 0).toFixed(2)}</td> : null}
                  <td className="px-2 py-2">{Number(row.sale_price ?? 0).toFixed(2)}</td>
                  <td className="px-2 py-2 font-semibold">{row.balance}</td>
                  <td className="px-2 py-2">{row.warranty_months ?? 0} мес</td>
                  <td className="px-2 py-2">{row.barcode ?? "-"}</td>
                  <td className="px-2 py-2">
                    <button
                      className="rounded-lg border px-2 py-1 text-xs"
                      onClick={() => {
                        setStockProduct(row);
                        setShowStockIn(true);
                      }}
                    >
                      Приход
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? <p className="p-4 text-sm text-slate-500">Товары не найдены</p> : null}
        </div>
      </div>

      {message ? <p className="mt-3 text-sm text-amber-700">{message}</p> : null}

      {selectedProduct ? (
        <div className="fixed inset-0 z-40 bg-black/20">
          <div className="ml-auto h-full w-full max-w-md overflow-auto bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-start justify-between">
              <h2 className="text-xl font-semibold">{selectedProduct.name}</h2>
              <button onClick={() => setSelectedProduct(null)} className="text-slate-500">
                ✕
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <p>Описание: {selectedProduct.description ?? "-"}</p>
              <p>Цена продажи: {Number(selectedProduct.sale_price ?? 0).toFixed(2)} сом</p>
              {isOwner ? (
                <p>Закупочная цена: {Number(selectedProduct.purchase_price ?? 0).toFixed(2)} сом</p>
              ) : null}
              <p>Гарантия: {selectedProduct.warranty_months ?? 0} мес</p>
              <p>Мин. остаток: {selectedProduct.min_stock ?? 0}</p>
              <p>Штрихкод: {selectedProduct.barcode ?? "-"}</p>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                className="flex-1 rounded-xl bg-primary p-3 text-white"
                onClick={() => {
                  openEdit(selectedProduct);
                  setSelectedProduct(null);
                }}
              >
                Редактировать
              </button>
              <button className="flex-1 rounded-xl border p-3">Распечатать ценник</button>
            </div>
          </div>
        </div>
      ) : null}

      {showEditor && isGrocery ? (
        <div className="fixed inset-0 z-40 overflow-auto bg-black/40 p-4">
          <div className="mx-auto max-w-3xl">
            <GroceryProductForm
              title={editingProduct ? "Редактирование товара" : "Новый товар"}
              form={groceryForm}
              setForm={setGroceryForm}
              categories={[]}
              units={["шт", "кг", "г", "л", "мл", "уп", "пачка", "рул"]}
              suppliers={(suppliersQuery.data ?? []) as { id: number; name: string }[]}
              onGenerateBarcode={
                editingProduct
                  ? () => generateBarcodeMutation.mutate(editingProduct.id)
                  : undefined
              }
              onSave={() => saveProductMutation.mutate()}
              onCancel={() => setShowEditor(false)}
              isSaving={saveProductMutation.isPending}
            />
          </div>
        </div>
      ) : null}

      {showEditor && !isGrocery ? (
        <div className="fixed inset-0 z-40 bg-black/40 p-4">
          <div className="mx-auto max-h-[95vh] max-w-2xl overflow-auto rounded-2xl bg-white p-4">
            <h2 className="mb-3 text-xl font-semibold">
              {editingProduct ? "Редактирование товара" : "Новый товар"}
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="rounded-xl border p-3 md:col-span-2"
                placeholder="Название"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <input
                className="rounded-xl border p-3 md:col-span-2"
                placeholder="Описание"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
              <NumberInput
                className="rounded-xl border p-3"
                placeholder={form.kind === "weighed" ? "Цена за 1 кг" : "Цена продажи"}
                value={form.sale_price}
                onChange={(value) => setForm((prev) => ({ ...prev, sale_price: value }))}
              />
              {orgHasWeighed ? (
                <div className="md:col-span-2 grid gap-3 rounded-xl border bg-slate-50 p-3 md:grid-cols-3">
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-slate-600">Тип товара</span>
                    <select
                      className="w-full rounded-lg border bg-white p-2"
                      value={form.kind}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, kind: e.target.value as "piece" | "weighed" }))
                      }
                    >
                      <option value="piece">Штучный</option>
                      <option value="weighed">Весовой</option>
                    </select>
                  </label>
                  {form.kind === "weighed" ? (
                    <>
                      <label className="text-sm">
                        <span className="mb-1 block text-xs text-slate-600">Единица</span>
                        <select
                          className="w-full rounded-lg border bg-white p-2"
                          value={form.unit}
                          onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
                        >
                          <option value="">кг (по умолчанию)</option>
                          <option value="kg">кг</option>
                          <option value="g">г</option>
                          <option value="l">л</option>
                        </select>
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-xs text-slate-600">
                          Код весов ({orgQuery.data?.weighed_code_length ?? "?"} цифр)
                        </span>
                        <input
                          className="w-full rounded-lg border bg-white p-2 font-mono"
                          value={form.weighing_code}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, weighing_code: e.target.value }))
                          }
                          inputMode="numeric"
                          pattern="\d+"
                          placeholder="12345"
                        />
                      </label>
                    </>
                  ) : null}
                </div>
              ) : null}
              {isOwner ? (
                <NumberInput
                  className="rounded-xl border p-3"
                  placeholder="Закупочная цена"
                  value={form.purchase_price}
                  onChange={(value) => setForm((prev) => ({ ...prev, purchase_price: value }))}
                />
              ) : null}
              <NumberInput
                className="rounded-xl border p-3"
                placeholder="Гарантия (мес)"
                value={form.warranty_months}
                onChange={(value) => setForm((prev) => ({ ...prev, warranty_months: value }))}
              />
              <NumberInput
                className="rounded-xl border p-3"
                placeholder="Минимальный остаток"
                value={form.min_stock}
                onChange={(value) => setForm((prev) => ({ ...prev, min_stock: value }))}
              />
              <div className="flex gap-2 md:col-span-2">
                <input
                  className="flex-1 rounded-xl border p-3"
                  placeholder="Штрихкод"
                  value={form.barcode}
                  onChange={(e) => setForm((prev) => ({ ...prev, barcode: e.target.value }))}
                />
                <button
                  className="rounded-xl border px-4"
                  disabled={!editingProduct || generateBarcodeMutation.isPending}
                  onClick={() => editingProduct && generateBarcodeMutation.mutate(editingProduct.id)}
                >
                  Сгенерировать
                </button>
              </div>
              <div className="md:col-span-2">
                <input
                  className="w-full rounded-xl border p-3"
                  placeholder="Доп. штрихкоды (через запятую) — для разных вкусов одного товара"
                  value={form.extra_barcodes}
                  onChange={(e) => setForm((prev) => ({ ...prev, extra_barcodes: e.target.value }))}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Все указанные коды будут вести к этому товару при сканировании. Один общий остаток.
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                className="flex-1 rounded-xl bg-primary p-3 text-white"
                onClick={() => saveProductMutation.mutate()}
              >
                Сохранить
              </button>
              <button className="flex-1 rounded-xl border p-3" onClick={() => setShowEditor(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showStockIn ? (
        <div className="fixed inset-0 z-40 bg-black/40 p-4">
          <div className="mx-auto max-w-md rounded-2xl bg-white p-4">
            <h2 className="mb-3 text-xl font-semibold">Приход товара: {stockProduct?.name}</h2>
            <div className="space-y-3">
              <NumberInput
                className="w-full rounded-xl border p-3"
                placeholder={(stockProduct as any)?.kind === "weighed" ? "Количество (кг)" : "Количество"}
                value={stockQty}
                onChange={setStockQty}
              />
              <NumberInput
                className="w-full rounded-xl border p-3"
                placeholder="Цена закупки (за ед./кг)"
                value={stockPurchasePrice}
                onChange={setStockPurchasePrice}
              />
              {isGrocery ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Поставщик</label>
                    <input
                      className="w-full rounded-xl border p-3"
                      list="products-suppliers-list"
                      placeholder="Выберите или введите нового"
                      value={stockSupplier}
                      onChange={(e) => setStockSupplier(e.target.value)}
                    />
                    <datalist id="products-suppliers-list">
                      {(suppliersQuery.data ?? []).map((s) => (
                        <option key={s.id} value={s.name} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Срок годности</label>
                    <input
                      type="date"
                      className="w-full rounded-xl border p-3"
                      value={stockExpiryDate}
                      onChange={(e) => setStockExpiryDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Номер партии</label>
                    <input
                      className="w-full rounded-xl border p-3"
                      placeholder="Batch # (необязательно)"
                      value={stockBatch}
                      onChange={(e) => setStockBatch(e.target.value)}
                    />
                  </div>
                </>
              ) : null}
            </div>
            <div className="mt-4 flex gap-2">
              <button className="flex-1 rounded-xl bg-primary p-3 text-white" onClick={() => stockInMutation.mutate()}>
                Сохранить
              </button>
              <button className="flex-1 rounded-xl border p-3" onClick={() => setShowStockIn(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
