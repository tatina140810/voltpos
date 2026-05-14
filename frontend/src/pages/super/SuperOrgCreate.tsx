import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import { extractError } from "../../lib/extractError";
import { superApi } from "../../lib/superApi";
import { STORE_CATEGORY_GROUPS } from "../../lib/storeCategories";

type FormState = {
  name: string;
  slug: string;
  category: string;
  monthly_fee: string;
  paid_until: string;
  owner_name: string;
  owner_phone: string;
  owner_password: string;
  owner_pin: string;
  owner_report_pin: string;
};

const initial: FormState = {
  name: "",
  slug: "",
  category: "",
  monthly_fee: "",
  paid_until: "",
  owner_name: "",
  owner_phone: "",
  owner_password: "",
  owner_pin: "",
  owner_report_pin: "",
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function SuperOrgCreate() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || slugify(form.name),
        category: form.category || null,
        monthly_fee: form.monthly_fee ? Number(form.monthly_fee) : null,
        paid_until: form.paid_until || null,
        owner_name: form.owner_name.trim(),
        owner_phone: form.owner_phone.trim(),
        owner_password: form.owner_password,
        owner_pin: form.owner_pin,
        owner_report_pin: form.owner_report_pin,
      };
      const response = await superApi.post("/super/orgs", payload);
      return response.data as { id: number };
    },
    onSuccess: (data) => {
      navigate(`/super/orgs/${data.id}`);
    },
    onError: (err) => setError(extractError(err, "Не удалось создать магазин")),
  });

  const update = (field: keyof FormState) => (event: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    mutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Новый магазин</h1>
        <Link to="/super/orgs" className="text-sm text-slate-500 hover:underline">← К списку</Link>
      </div>

      <form onSubmit={onSubmit} className="space-y-6 rounded-2xl border bg-white p-6 shadow-sm">
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Магазин</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">Название</span>
              <input
                className="w-full rounded-lg border p-2.5"
                value={form.name}
                onChange={update("name")}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">Slug (латиница, без пробелов)</span>
              <input
                className="w-full rounded-lg border p-2.5 font-mono text-sm"
                value={form.slug}
                onChange={update("slug")}
                placeholder={slugify(form.name) || "ogonek"}
                pattern="[a-z0-9-]+"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1 block text-sm text-slate-600">Категория магазина</span>
              <select
                className="w-full rounded-lg border bg-white p-2.5"
                value={form.category}
                onChange={update("category")}
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
                value={form.monthly_fee}
                onChange={update("monthly_fee")}
                placeholder="3000"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">Оплачено до</span>
              <input
                className="w-full rounded-lg border p-2.5"
                type="date"
                value={form.paid_until}
                onChange={update("paid_until")}
              />
            </label>
          </div>
        </section>

        <section className="space-y-4 border-t pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Владелец (owner)</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">Имя</span>
              <input className="w-full rounded-lg border p-2.5" value={form.owner_name} onChange={update("owner_name")} required />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">Телефон</span>
              <input
                className="w-full rounded-lg border p-2.5"
                value={form.owner_phone}
                onChange={update("owner_phone")}
                placeholder="+996..."
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">Пароль (для логина)</span>
              <input
                className="w-full rounded-lg border p-2.5"
                type="password"
                value={form.owner_password}
                onChange={update("owner_password")}
                minLength={4}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">PIN кассы (4-6 цифр)</span>
              <input
                className="w-full rounded-lg border p-2.5 font-mono"
                value={form.owner_pin}
                onChange={update("owner_pin")}
                inputMode="numeric"
                pattern="\d{4,6}"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-600">Report PIN (для отчётов)</span>
              <input
                className="w-full rounded-lg border p-2.5 font-mono"
                value={form.owner_report_pin}
                onChange={update("owner_report_pin")}
                inputMode="numeric"
                pattern="\d{4,6}"
                required
              />
            </label>
          </div>
        </section>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <div className="flex justify-end gap-3">
          <Link to="/super/orgs" className="rounded-lg border px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Отмена
          </Link>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-lg bg-slate-900 px-6 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {mutation.isPending ? "Создаём..." : "Создать магазин"}
          </button>
        </div>
      </form>
    </div>
  );
}
