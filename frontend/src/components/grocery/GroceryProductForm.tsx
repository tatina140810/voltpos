import { useState } from "react";

import { BarcodeScanner } from "../BarcodeScanner";
import { NumberInput } from "../NumberInput";

export type GroceryFormState = {
  // основное
  name: string;
  category: string;
  barcode: string;
  weighing_code: string;
  kind: "piece" | "weighed" | "volume";
  unit: string;
  // цены
  sale_price: string;
  purchase_price: string;
  vat_rate: string;
  promo_price: string;
  promo_until_date: string;
  // хранение и сроки
  shelf_life_days: string;
  min_days_before_expiry: string;
  storage_temp: string;
  // поставщик
  manufacturer: string;
  country_of_origin: string;
  supplier_id: number | null;
  supplier_name: string;  // имя для отображения в input datalist
  // склад
  min_stock: string;
  storage_location: string;
  description: string;
};

export const groceryEmptyForm: GroceryFormState = {
  name: "",
  category: "",
  barcode: "",
  weighing_code: "",
  kind: "piece",
  unit: "шт",
  sale_price: "",
  purchase_price: "",
  vat_rate: "0",
  promo_price: "",
  promo_until_date: "",
  shelf_life_days: "",
  min_days_before_expiry: "0",
  storage_temp: "",
  manufacturer: "",
  country_of_origin: "",
  supplier_id: null,
  supplier_name: "",
  min_stock: "1",
  storage_location: "",
  description: "",
};

const COUNTRIES = ["Кыргызстан", "Казахстан", "Россия", "Китай", "Турция", "Германия", "Узбекистан", "Беларусь", "Другое"];
const STORAGE_TEMPS: { value: string; label: string }[] = [
  { value: "ambient", label: "Комнатная температура (15-25°C)" },
  { value: "cool", label: "Прохладное место (до 15°C)" },
  { value: "refrigerated", label: "Холодильник (+2°C до +8°C)" },
  { value: "frozen", label: "Заморозка (до -18°C)" },
];

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-violet-700">
        <span className="text-xl">{icon}</span>
        <span>{title}</span>
      </h3>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </div>
  );
}

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <span className="mb-1 block text-sm text-slate-600">
      {text} {required ? <span className="text-rose-500">*</span> : null}
    </span>
  );
}

export function GroceryProductForm({
  form,
  setForm,
  categories,
  units,
  suppliers,
  onGenerateBarcode,
  onSave,
  onCancel,
  isSaving,
  title,
}: {
  form: GroceryFormState;
  setForm: (next: GroceryFormState) => void;
  categories: string[];
  units: string[];
  suppliers: { id: number; name: string; usage_count?: number }[];
  onGenerateBarcode?: () => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving?: boolean;
  title: string;
}) {
  const update = <K extends keyof GroceryFormState>(key: K, value: GroceryFormState[K]) =>
    setForm({ ...form, [key]: value });
  const [scannerOpen, setScannerOpen] = useState(false);

  const unitOptions = Array.from(new Set([...units, "шт", "кг", "г", "л", "мл", "уп", "пачка", "рул"]));

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>

      {/* === Секция 1: основное === */}
      <Section icon="🏷" title="Основное">
        <label className="block md:col-span-2">
          <Label text="Название товара" required />
          <input
            className="w-full rounded-lg border p-2.5"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            required
          />
        </label>
        <label className="block">
          <Label text="Категория" />
          <input
            className="w-full rounded-lg border p-2.5"
            list="grocery-categories"
            value={form.category}
            onChange={(e) => update("category", e.target.value)}
            placeholder="Например, Молочные продукты"
          />
          <datalist id="grocery-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <Label text="Штрихкод" />
          <div className="flex gap-2">
            <input
              className="w-full rounded-lg border p-2.5 font-mono text-sm"
              value={form.barcode}
              onChange={(e) => update("barcode", e.target.value)}
              placeholder="EAN-13"
            />
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="rounded-lg border px-3 text-sm text-slate-700 hover:bg-slate-50"
              title="Сканировать камерой"
            >
              📷
            </button>
            {onGenerateBarcode ? (
              <button
                type="button"
                onClick={onGenerateBarcode}
                className="rounded-lg border px-3 text-sm text-slate-700 hover:bg-slate-50"
              >
                Сгенер.
              </button>
            ) : null}
          </div>
        </label>
        <label className="block">
          <Label text="PLU / Код весов" />
          <input
            className="w-full rounded-lg border p-2.5 font-mono"
            value={form.weighing_code}
            onChange={(e) => update("weighing_code", e.target.value)}
            inputMode="numeric"
            pattern="\d{4,6}"
            placeholder="12345"
          />
          <span className="mt-1 block text-xs text-slate-500">Для весовых товаров без штрихкода</span>
        </label>
        <div className="block">
          <Label text="Тип товара" required />
          <div className="flex flex-wrap gap-2">
            {(["piece", "weighed", "volume"] as const).map((k) => (
              <label key={k} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm">
                <input
                  type="radio"
                  name="kind"
                  checked={form.kind === k}
                  onChange={() => {
                    const defaultUnit = k === "piece" ? "шт" : k === "weighed" ? "кг" : "л";
                    setForm({ ...form, kind: k, unit: defaultUnit });
                  }}
                />
                {k === "piece" ? "Штучный" : k === "weighed" ? "Весовой" : "Объёмный"}
              </label>
            ))}
          </div>
        </div>
        <label className="block">
          <Label text="Единица измерения" />
          <select
            className="w-full rounded-lg border bg-white p-2.5"
            value={form.unit}
            onChange={(e) => update("unit", e.target.value)}
          >
            {unitOptions.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </label>
      </Section>

      {/* === Секция 2: цены === */}
      <Section icon="💰" title="Цены">
        <label className="block">
          <Label
            text={
              form.kind === "weighed" ? "Цена продажи (за кг)" :
              form.kind === "volume" ? "Цена продажи (за л)" :
              "Цена продажи (за шт)"
            }
            required
          />
          <NumberInput
            className="w-full rounded-lg border p-2.5"
            value={form.sale_price}
            onChange={(v) => update("sale_price", v)}
          />
        </label>
        <label className="block">
          <Label text="Цена закупки" />
          <NumberInput
            className="w-full rounded-lg border p-2.5"
            value={form.purchase_price}
            onChange={(v) => update("purchase_price", v)}
          />
        </label>
        <label className="block">
          <Label text="Ставка НДС" />
          <select
            className="w-full rounded-lg border bg-white p-2.5"
            value={form.vat_rate}
            onChange={(e) => update("vat_rate", e.target.value)}
          >
            <option value="0">0%</option>
            <option value="10">10%</option>
            <option value="12">12%</option>
            <option value="20">20%</option>
          </select>
        </label>
        <label className="block">
          <Label text="Акционная цена" />
          <NumberInput
            className="w-full rounded-lg border p-2.5"
            value={form.promo_price}
            onChange={(v) => update("promo_price", v)}
          />
          <span className="mt-1 block text-xs text-slate-500">Если задана — продаётся по ней до даты ниже</span>
        </label>
        <label className="block">
          <Label text="Акция действует до" />
          <input
            type="date"
            className="w-full rounded-lg border p-2.5"
            value={form.promo_until_date}
            onChange={(e) => update("promo_until_date", e.target.value)}
          />
        </label>
      </Section>

      {/* === Секция 3: хранение и сроки === */}
      <Section icon="📅" title="Хранение и сроки">
        <label className="block">
          <Label text="Срок хранения (дней)" />
          <NumberInput
            className="w-full rounded-lg border p-2.5"
            value={form.shelf_life_days}
            onChange={(v) => update("shelf_life_days", v)}
          />
          <span className="mt-1 block text-xs text-slate-500">С даты производства</span>
        </label>
        <label className="block">
          <Label text="Снимать с продажи за (дней до истечения)" />
          <NumberInput
            className="w-full rounded-lg border p-2.5"
            value={form.min_days_before_expiry}
            onChange={(v) => update("min_days_before_expiry", v)}
          />
        </label>
        <label className="block md:col-span-2">
          <Label text="Температурный режим" />
          <select
            className="w-full rounded-lg border bg-white p-2.5"
            value={form.storage_temp}
            onChange={(e) => update("storage_temp", e.target.value)}
          >
            <option value="">— не указано —</option>
            {STORAGE_TEMPS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
      </Section>

      {/* === Секция 4: поставщик === */}
      <Section icon="🏭" title="Поставщик и производство">
        <label className="block md:col-span-2">
          <Label text="Поставщик" />
          <input
            className="w-full rounded-lg border p-2.5"
            list="grocery-suppliers-list"
            value={form.supplier_name}
            placeholder="Начни вводить имя поставщика…"
            onChange={(e) => {
              const value = e.target.value;
              const match = suppliers.find((s) => s.name === value);
              setForm({
                ...form,
                supplier_name: value,
                supplier_id: match ? match.id : null,
              });
            }}
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (!value) {
                setForm({ ...form, supplier_name: "", supplier_id: null });
                return;
              }
              const match = suppliers.find((s) => s.name === value);
              if (match) {
                setForm({ ...form, supplier_name: match.name, supplier_id: match.id });
              }
              // Если такого нет — оставляем имя в поле, supplier_id уже null,
              // на бэк уйдёт null. Юзер может зайти в «Поставщики» и добавить.
            }}
          />
          <datalist id="grocery-suppliers-list">
            {suppliers.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
          {form.supplier_name && !form.supplier_id ? (
            <span className="mt-1 block text-xs text-amber-600">
              Такого поставщика нет в базе. Добавь его в разделе «Поставщики», чтобы привязать.
            </span>
          ) : null}
        </label>
        <label className="block">
          <Label text="Производитель / Бренд" />
          <input
            className="w-full rounded-lg border p-2.5"
            value={form.manufacturer}
            onChange={(e) => update("manufacturer", e.target.value)}
          />
        </label>
        <label className="block">
          <Label text="Страна производитель" />
          <select
            className="w-full rounded-lg border bg-white p-2.5"
            value={form.country_of_origin}
            onChange={(e) => update("country_of_origin", e.target.value)}
          >
            <option value="">— не указано —</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      </Section>

      {/* === Секция 5: склад === */}
      <Section icon="📦" title="Склад">
        <label className="block">
          <Label text="Минимальный остаток" required />
          <NumberInput
            className="w-full rounded-lg border p-2.5"
            value={form.min_stock}
            onChange={(v) => update("min_stock", v)}
          />
          <span className="mt-1 block text-xs text-slate-500">При достижении — красная строка</span>
        </label>
        <label className="block">
          <Label text="Место хранения" />
          <input
            className="w-full rounded-lg border p-2.5"
            value={form.storage_location}
            onChange={(e) => update("storage_location", e.target.value)}
            placeholder="Полка, стеллаж, секция"
          />
        </label>
        <label className="block md:col-span-2">
          <Label text="Описание" />
          <textarea
            className="w-full rounded-lg border p-2.5"
            rows={2}
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
          />
        </label>
      </Section>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="rounded-lg bg-violet-600 px-6 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isSaving ? "Сохраняем..." : "Сохранить товар"}
        </button>
      </div>

      {scannerOpen ? (
        <BarcodeScanner
          onDetected={(code) => {
            update("barcode", code);
            setScannerOpen(false);
          }}
          onClose={() => setScannerOpen(false)}
        />
      ) : null}
    </div>
  );
}
