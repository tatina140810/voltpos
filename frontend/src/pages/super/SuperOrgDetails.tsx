import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import { extractError } from "../../lib/extractError";
import { superApi } from "../../lib/superApi";
import { STORE_CATEGORY_GROUPS } from "../../lib/storeCategories";
import { MODULE_LABELS } from "../../lib/businessModules";

type Employee = {
  id: number;
  name: string;
  phone: string;
  role: "owner" | "seller" | "warehouse";
  has_pin: boolean;
};

type Payment = {
  id: number;
  amount: number;
  period_until: string;
  paid_at: string;
  note: string | null;
};

type OrgDetails = {
  id: number;
  name: string;
  org_code: string;
  slug: string;
  plan: string;
  is_active: boolean;
  monthly_fee: number | null;
  paid_until: string | null;
  category: string | null;
  weighed: {
    enabled: boolean;
    prefix: string | null;
    code_length: number | null;
    grams_length: number | null;
  };
  business_type: string | null;
  business_modules: Record<string, boolean>;
  business_units: string[];
  status: "active" | "blocked" | "no_payment_set";
  days_left: number | null;
  created_at: string;
  employees: Employee[];
  payments: Payment[];
};

const statusBadge = {
  active: "bg-emerald-100 text-emerald-700",
  blocked: "bg-rose-100 text-rose-700",
  no_payment_set: "bg-amber-100 text-amber-700",
};

function formatRu(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("ru-RU");
}


export function SuperOrgDetails() {
  const params = useParams<{ id: string }>();
  const orgId = Number(params.id);
  const queryClient = useQueryClient();

  const { data: org, isLoading } = useQuery<OrgDetails>({
    queryKey: ["super", "org", orgId],
    queryFn: async () => (await superApi.get<OrgDetails>(`/super/orgs/${orgId}`)).data,
    enabled: !Number.isNaN(orgId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["super", "org", orgId] });
    queryClient.invalidateQueries({ queryKey: ["super", "orgs"] });
    queryClient.invalidateQueries({ queryKey: ["super", "stats"] });
  };

  if (isLoading) return <p className="text-slate-500">Загрузка...</p>;
  if (!org) return <p className="text-rose-600">Магазин не найден.</p>;

  const status = statusBadge[org.status];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/super/orgs" className="text-sm text-slate-500 hover:underline">← Все магазины</Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{org.name}</h1>
          <p className="font-mono text-sm text-slate-500">{org.org_code} · {org.slug}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm ${status}`}>
          {org.status === "active" && `Активен (${org.days_left} дн осталось)`}
          {org.status === "blocked" && "Заблокирован"}
          {org.status === "no_payment_set" && "Без подписки"}
        </span>
      </div>

      <OrgInfoCard org={org} onUpdated={invalidate} />
      <BusinessTypeCard org={org} onUpdated={invalidate} />
      <PaymentsCard org={org} onUpdated={invalidate} />
      <ImportCard orgId={org.id} />
      <EmployeesCard org={org} onUpdated={invalidate} />
    </div>
  );
}

type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; reason: string }[];
};

function ImportCard({ orgId }: { orgId: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Файл не выбран");
      const form = new FormData();
      form.append("file", file);
      const response = await superApi.post<ImportResult>(`/super/orgs/${orgId}/import`, form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      });
      return response.data;
    },
    onSuccess: (data) => {
      setResult(data);
      setFile(null);
    },
    onError: (err) => setError(extractError(err, "Не удалось импортировать")),
  });

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Импорт остатков из Excel</h2>
      <p className="mt-2 text-sm text-slate-500">
        Загрузите .xlsx-файл экспорта Umag. Колонки: A — название, B — категория, D — штрихкод, F — количество,
        H — цена продажи, J — закупочная цена. Существующие товары обновятся, кол-во добавится как приход.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setError("");
          }}
          className="text-sm"
        />
        <button
          onClick={() => {
            setError("");
            upload.mutate();
          }}
          disabled={!file || upload.isPending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {upload.isPending ? "Загружаем..." : "Загрузить и импортировать"}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

      {result ? (
        <div className="mt-4 space-y-2 rounded-xl border bg-slate-50 p-4 text-sm">
          <div className="flex gap-6">
            <span className="text-emerald-700">Создано: <b>{result.created}</b></span>
            <span className="text-blue-700">Обновлено: <b>{result.updated}</b></span>
            <span className="text-amber-700">Пропущено: <b>{result.skipped}</b></span>
            <span className="text-rose-700">Ошибок: <b>{result.errors.length}</b></span>
          </div>
          {result.errors.length > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-slate-600 hover:underline">
                Показать ошибки и пропуски ({result.errors.length})
              </summary>
              <ul className="mt-2 max-h-64 list-disc space-y-1 overflow-auto pl-6 text-xs text-slate-600">
                {result.errors.map((err, idx) => (
                  <li key={idx}>
                    Строка {err.row}: {err.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function OrgInfoCard({ org, onUpdated }: { org: OrgDetails; onUpdated: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await superApi.delete(`/super/orgs/${org.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super", "orgs"] });
      queryClient.invalidateQueries({ queryKey: ["super", "stats"] });
      navigate("/super/orgs");
    },
    onError: (err) => setDeleteError(extractError(err, "Не удалось удалить магазин")),
  });
  const [name, setName] = useState(org.name);
  const [category, setCategory] = useState(org.category || "");
  const [monthlyFee, setMonthlyFee] = useState(org.monthly_fee?.toString() || "");
  const [paidUntil, setPaidUntil] = useState(org.paid_until || "");
  const [isActive, setIsActive] = useState(org.is_active);
  const [weighedOn, setWeighedOn] = useState(org.weighed.enabled);
  const [wPrefix, setWPrefix] = useState(org.weighed.prefix || "");
  const [wCodeLen, setWCodeLen] = useState(org.weighed.code_length?.toString() || "");
  const [wGramsLen, setWGramsLen] = useState(org.weighed.grams_length?.toString() || "");
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      await superApi.patch(`/super/orgs/${org.id}`, {
        name,
        category: category || null,
        monthly_fee: monthlyFee ? Number(monthlyFee) : null,
        paid_until: paidUntil || null,
        is_active: isActive,
        has_weighed_products: weighedOn,
        weighed_barcode_prefix: weighedOn ? wPrefix || null : null,
        weighed_code_length: weighedOn && wCodeLen ? Number(wCodeLen) : null,
        weighed_grams_length: weighedOn && wGramsLen ? Number(wGramsLen) : null,
      });
    },
    onSuccess: () => {
      setEditing(false);
      onUpdated();
    },
    onError: (err) => setError(extractError(err, "Ошибка сохранения")),
  });

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Магазин и подписка</h2>
        {!editing ? (
          <div className="flex gap-4">
            <button onClick={() => setEditing(true)} className="text-sm text-blue-600 hover:underline">
              Изменить
            </button>
            <button
              onClick={() => {
                setConfirmDelete(true);
                setConfirmText("");
                setDeleteError("");
              }}
              className="text-sm text-rose-600 hover:underline"
            >
              Удалить магазин
            </button>
          </div>
        ) : null}
      </div>

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Удалить магазин «{org.name}»?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Магазин будет помечен удалённым и пропадёт из списка. Кассиры не смогут войти.
              Данные (товары, продажи) физически останутся в БД — можно восстановить вручную.
            </p>
            <p className="mt-3 text-sm text-slate-700">
              Чтобы подтвердить, введите название магазина: <b>{org.name}</b>
            </p>
            <input
              className="mt-2 w-full rounded-lg border p-2.5"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={org.name}
              autoFocus
            />
            {deleteError ? <p className="mt-2 text-sm text-rose-600">{deleteError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  setDeleteError("");
                  deleteMutation.mutate();
                }}
                disabled={confirmText.trim() !== org.name || deleteMutation.isPending}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {deleteMutation.isPending ? "Удаляем..." : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!editing ? (
        <dl className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Название" value={org.name} />
          <Field label="Категория" value={org.category || "—"} />
          <Field label="Цена в месяц" value={org.monthly_fee != null ? `${org.monthly_fee.toLocaleString("ru-RU")} ₽` : "—"} />
          <Field label="Оплачено до" value={org.paid_until ? formatRu(org.paid_until) : "—"} />
          <Field label="Активен" value={org.is_active ? "Да" : "Нет"} />
          <Field label="Код входа" value={org.org_code} mono />
          <Field label="Создан" value={new Date(org.created_at).toLocaleDateString("ru-RU")} />
          <Field
            label="Весовые товары"
            value={
              org.weighed.enabled
                ? `Вкл (формат: ${org.weighed.prefix}+${org.weighed.code_length}код+${org.weighed.grams_length}гр)`
                : "Выкл"
            }
          />
        </dl>
      ) : (
        <form
          className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            save.mutate();
          }}
        >
          <label className="block">
            <span className="mb-1 block text-sm text-slate-600">Название</span>
            <input className="w-full rounded-lg border p-2.5" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-600">Категория магазина</span>
            <select
              className="w-full rounded-lg border bg-white p-2.5"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">— не выбрана —</option>
              {STORE_CATEGORY_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.items.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-600">Цена в месяц, ₽</span>
            <input
              className="w-full rounded-lg border p-2.5"
              type="number"
              min={0}
              value={monthlyFee}
              onChange={(e) => setMonthlyFee(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-slate-600">Оплачено до</span>
            <input
              className="w-full rounded-lg border p-2.5"
              type="date"
              value={paidUntil}
              onChange={(e) => setPaidUntil(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 pt-7">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <span className="text-sm">Магазин активен (если выключить — касса не пустит)</span>
          </label>
          <div className="md:col-span-2 rounded-lg border bg-slate-50 p-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={weighedOn} onChange={(e) => setWeighedOn(e.target.checked)} />
              <span className="text-sm font-medium">Включить весовые товары (интеграция с весами)</span>
            </label>
            {weighedOn ? (
              <div className="mt-3 grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-600">Префикс штрихкода</span>
                  <input
                    className="w-full rounded border p-2 font-mono"
                    value={wPrefix}
                    onChange={(e) => setWPrefix(e.target.value)}
                    placeholder="2 или 21"
                    pattern="\d{1,2}"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-600">Длина кода товара</span>
                  <input
                    className="w-full rounded border p-2"
                    type="number"
                    min={1}
                    max={10}
                    value={wCodeLen}
                    onChange={(e) => setWCodeLen(e.target.value)}
                    placeholder="5"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-600">Длина граммов</span>
                  <input
                    className="w-full rounded border p-2"
                    type="number"
                    min={1}
                    max={10}
                    value={wGramsLen}
                    onChange={(e) => setWGramsLen(e.target.value)}
                    placeholder="5"
                  />
                </label>
                <p className="md:col-span-3 text-xs text-slate-500">
                  Сумма (префикс + код + граммы + 1 контрольная цифра) должна равняться 13.
                  Сейчас: {wPrefix.length} + {wCodeLen || "?"} + {wGramsLen || "?"} + 1 ={" "}
                  {wPrefix.length + (Number(wCodeLen) || 0) + (Number(wGramsLen) || 0) + 1}
                </p>
              </div>
            ) : null}
          </div>
          {error ? <p className="md:col-span-2 text-sm text-rose-600">{error}</p> : null}
          <div className="md:col-span-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={save.isPending}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {save.isPending ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-1 text-base text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

type BusinessTemplate = {
  key: string;
  name: string;
  icon: string;
  units: string[];
  modules: Record<string, boolean>;
  default_categories: string[];
};

function BusinessTypeCard({ org, onUpdated }: { org: OrgDetails; onUpdated: () => void }) {
  const { data: templates } = useQuery<BusinessTemplate[]>({
    queryKey: ["super", "business-templates"],
    queryFn: async () => (await superApi.get<BusinessTemplate[]>("/super/business/templates")).data,
  });

  const [selectedKey, setSelectedKey] = useState(org.business_type || "");
  const [error, setError] = useState("");
  const [flashKey, setFlashKey] = useState<string | null>(null);

  const currentTemplate = templates?.find((t) => t.key === org.business_type);
  const previewTemplate = templates?.find((t) => t.key === selectedKey);

  const apply = useMutation({
    mutationFn: async () => {
      if (!selectedKey) return;
      await superApi.post(`/super/orgs/${org.id}/business-type`, {
        business_type: selectedKey,
      });
    },
    onSuccess: onUpdated,
    onError: (err) => setError(extractError(err, "Не удалось применить шаблон")),
  });

  const toggleModule = useMutation({
    mutationFn: async (vars: { key: string; value: boolean }) => {
      await superApi.patch(`/super/orgs/${org.id}/modules`, {
        modules: { [vars.key]: vars.value },
      });
      return vars.key;
    },
    onSuccess: (key) => {
      setFlashKey(key);
      setTimeout(() => setFlashKey((curr) => (curr === key ? null : curr)), 1800);
      onUpdated();
    },
    onError: (err) => setError(extractError(err, "Не удалось обновить модули")),
  });

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Шаблон бизнеса и модули
      </h2>

      <div className="mt-4 space-y-4">
        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="text-sm text-slate-600">Текущий шаблон:</div>
          <div className="mt-1 text-lg font-medium">
            {currentTemplate ? `${currentTemplate.icon} ${currentTemplate.name}` : "— не выбран —"}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="md:col-span-2 block">
            <span className="mb-1 block text-sm text-slate-600">Выбрать или сменить шаблон</span>
            <select
              className="w-full rounded-lg border bg-white p-2.5"
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
            >
              <option value="">— не менять —</option>
              {(templates ?? []).map((t) => (
                <option key={t.key} value={t.key}>
                  {t.icon} {t.name}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => {
              setError("");
              apply.mutate();
            }}
            disabled={!selectedKey || apply.isPending || selectedKey === org.business_type}
            title="Сменит шаблон и СБРОСИТ ручные настройки модулей по выбранному шаблону. Активна только когда выбран другой шаблон."
            className="self-end rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {apply.isPending ? "Применяем..." : "Применить шаблон"}
          </button>
        </div>

        {previewTemplate && selectedKey !== org.business_type ? (
          <div className="rounded-lg border bg-blue-50 p-3 text-sm">
            <div className="font-medium text-blue-900">Будет применено:</div>
            <div className="mt-1 text-blue-800">
              Включится: {
                Object.entries(previewTemplate.modules)
                  .filter(([, v]) => v)
                  .map(([k]) => MODULE_LABELS.find((m) => m.key === k)?.label ?? k)
                  .join(", ") || "—"
              }
            </div>
            <div className="mt-1 text-blue-800">
              Выключится: {
                Object.entries(previewTemplate.modules)
                  .filter(([, v]) => !v)
                  .map(([k]) => MODULE_LABELS.find((m) => m.key === k)?.label ?? k)
                  .join(", ") || "—"
              }
            </div>
            <div className="mt-1 text-blue-800">
              Подсказки категорий: {previewTemplate.default_categories.join(", ")}
            </div>
          </div>
        ) : null}

        {org.business_type ? (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium text-slate-700">Модули (можно докрутить вручную)</div>
              <div className="text-xs text-slate-500">Изменения сохраняются автоматически</div>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {MODULE_LABELS.map((m) => {
                const value = org.business_modules[m.key] ?? false;
                const flashed = flashKey === m.key;
                return (
                  <label key={m.key} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                    <input
                      type="checkbox"
                      checked={value}
                      disabled={toggleModule.isPending}
                      onChange={(e) => {
                        setError("");
                        toggleModule.mutate({ key: m.key, value: e.target.checked });
                      }}
                    />
                    <span>{m.icon}</span>
                    <span className={value ? "text-slate-900" : "text-slate-500"}>{m.label}</span>
                    {flashed ? (
                      <span className="ml-auto text-xs font-medium text-emerald-600">✓ Сохранено</span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Сначала выберите и примените шаблон — тогда модули можно будет докрутить отдельно.
          </p>
        )}

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      </div>
    </section>
  );
}

function PaymentsCard({ org, onUpdated }: { org: OrgDetails; onUpdated: () => void }) {
  const [amount, setAmount] = useState(org.monthly_fee?.toString() || "");
  const [periodUntil, setPeriodUntil] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      await superApi.post(`/super/orgs/${org.id}/payments`, {
        amount: Number(amount),
        period_until: periodUntil,
        note: note || null,
      });
    },
    onSuccess: () => {
      setAmount(org.monthly_fee?.toString() || "");
      setPeriodUntil("");
      setNote("");
      onUpdated();
    },
    onError: (err) => setError(extractError(err, "Не удалось сохранить платёж")),
  });

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Платежи</h2>

      <form
        className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          submit.mutate();
        }}
      >
        <input
          className="rounded-lg border p-2.5"
          type="number"
          min={0}
          placeholder="Сумма ₽"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <input
          className="rounded-lg border p-2.5"
          type="date"
          value={periodUntil}
          onChange={(e) => setPeriodUntil(e.target.value)}
          required
        />
        <input
          className="rounded-lg border p-2.5 md:col-span-1"
          placeholder="Комментарий"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          type="submit"
          disabled={submit.isPending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submit.isPending ? "..." : "Зафиксировать"}
        </button>
        {error ? <p className="md:col-span-4 text-sm text-rose-600">{error}</p> : null}
      </form>

      {org.payments.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">Платежей пока нет.</p>
      ) : (
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-2">Оплачено</th>
              <th className="py-2">Сумма</th>
              <th className="py-2">До какого числа</th>
              <th className="py-2">Комментарий</th>
            </tr>
          </thead>
          <tbody>
            {org.payments.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="py-2">{formatRu(p.paid_at)}</td>
                <td className="py-2">{p.amount.toLocaleString("ru-RU")} ₽</td>
                <td className="py-2">{formatRu(p.period_until)}</td>
                <td className="py-2 text-slate-600">{p.note || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function EmployeesCard({ org, onUpdated }: { org: OrgDetails; onUpdated: () => void }) {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Сотрудники</h2>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="text-sm text-blue-600 hover:underline"
        >
          {showAdd ? "Скрыть форму" : "+ Добавить сотрудника"}
        </button>
      </div>

      {showAdd ? (
        <AddEmployeeForm
          orgId={org.id}
          onDone={() => {
            setShowAdd(false);
            onUpdated();
          }}
        />
      ) : null}

      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="py-2">Имя</th>
            <th className="py-2">Телефон</th>
            <th className="py-2">Роль</th>
            <th className="py-2">PIN</th>
            <th className="py-2 text-right"></th>
          </tr>
        </thead>
        <tbody>
          {org.employees.map((emp) => (
            <EmployeeRow key={emp.id} orgId={org.id} emp={emp} onUpdated={onUpdated} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function EmployeeRow({ orgId, emp, onUpdated }: { orgId: number; emp: Employee; onUpdated: () => void }) {
  const [editingPin, setEditingPin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState("");

  const savePin = useMutation({
    mutationFn: async () => {
      await superApi.patch(`/super/orgs/${orgId}/users/${emp.id}`, { pin_code: newPin });
    },
    onSuccess: () => {
      setEditingPin(false);
      setNewPin("");
      onUpdated();
    },
    onError: (err) => setError(extractError(err, "Ошибка сохранения PIN")),
  });

  const remove = useMutation({
    mutationFn: async () => {
      await superApi.delete(`/super/orgs/${orgId}/users/${emp.id}`);
    },
    onSuccess: onUpdated,
    onError: (err) => setError(extractError(err, "Не удалось удалить сотрудника")),
  });

  return (
    <tr className="border-t">
      <td className="py-2 font-medium text-slate-900">{emp.name}</td>
      <td className="py-2 text-slate-600">{emp.phone}</td>
      <td className="py-2 text-slate-600">{emp.role}</td>
      <td className="py-2">
        {editingPin ? (
          <div className="flex items-center gap-2">
            <input
              className="w-24 rounded border p-1 font-mono text-sm"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              inputMode="numeric"
              pattern="\d{4,6}"
              placeholder="новый PIN"
            />
            <button
              onClick={() => {
                setError("");
                savePin.mutate();
              }}
              disabled={savePin.isPending || !newPin}
              className="rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50"
            >
              ОК
            </button>
            <button
              onClick={() => {
                setEditingPin(false);
                setNewPin("");
              }}
              className="text-xs text-slate-500"
            >
              отмена
            </button>
          </div>
        ) : (
          <span className="text-slate-500">{emp.has_pin ? "••••" : "не задан"}</span>
        )}
      </td>
      <td className="py-2 text-right">
        {!editingPin ? (
          <div className="flex justify-end gap-3">
            <button onClick={() => setEditingPin(true)} className="text-xs text-blue-600 hover:underline">
              Сменить PIN
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Удалить сотрудника «${emp.name}»?`)) {
                  setError("");
                  remove.mutate();
                }
              }}
              className="text-xs text-rose-600 hover:underline"
              disabled={remove.isPending}
            >
              Удалить
            </button>
          </div>
        ) : null}
        {error ? <div className="mt-1 text-xs text-rose-600">{error}</div> : null}
      </td>
    </tr>
  );
}

function AddEmployeeForm({ orgId, onDone }: { orgId: number; onDone: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"seller" | "warehouse" | "owner">("seller");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      await superApi.post(`/super/orgs/${orgId}/users`, {
        name,
        phone,
        role,
        pin_code: pin,
        password,
      });
    },
    onSuccess: () => {
      setName(""); setPhone(""); setPin(""); setPassword(""); setRole("seller");
      onDone();
    },
    onError: (err) => setError(extractError(err, "Не удалось добавить сотрудника")),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    create.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="mt-4 grid grid-cols-1 gap-3 rounded-xl border bg-slate-50 p-4 md:grid-cols-5">
      <input className="rounded-lg border p-2" placeholder="Имя" value={name} onChange={(e) => setName(e.target.value)} required />
      <input className="rounded-lg border p-2" placeholder="Телефон +996..." value={phone} onChange={(e) => setPhone(e.target.value)} required />
      <select className="rounded-lg border p-2" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
        <option value="seller">Продавец</option>
        <option value="warehouse">Склад</option>
        <option value="owner">Владелец</option>
      </select>
      <input
        className="rounded-lg border p-2 font-mono"
        placeholder="PIN 4-6 цифр"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        inputMode="numeric"
        pattern="\d{4,6}"
        required
      />
      <input
        className="rounded-lg border p-2"
        type="password"
        placeholder="Пароль"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={4}
        required
      />
      {error ? <p className="md:col-span-5 text-sm text-rose-600">{error}</p> : null}
      <button
        type="submit"
        disabled={create.isPending}
        className="md:col-span-5 rounded-lg bg-slate-900 p-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {create.isPending ? "Сохраняем..." : "Добавить сотрудника"}
      </button>
    </form>
  );
}
