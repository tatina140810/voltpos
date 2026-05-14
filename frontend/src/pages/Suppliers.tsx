import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";

import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";
import { useBusinessSettings } from "../hooks/useBusinessSettings";

type Supplier = {
  id: number;
  name: string;
  contact: string | null;
  note: string | null;
  usage_count: number;
};

type FormState = { id: number | null; name: string; contact: string; note: string };

const emptyForm: FormState = { id: null, name: "", contact: "", note: "" };

export function Suppliers() {
  const role = useAuthStore((s) => s.role);
  const { type: businessType } = useBusinessSettings();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const isGrocery = businessType === "grocery";
  const isOwner = role === "owner";

  const suppliersQuery = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await api.get("/suppliers")).data as Supplier[],
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        contact: form.contact.trim() || null,
        note: form.note.trim() || null,
      };
      if (form.id) {
        return (await api.patch(`/suppliers/${form.id}`, payload)).data;
      }
      return (await api.post("/suppliers", payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setForm(emptyForm);
      setShowForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/suppliers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });

  const filtered = useMemo(() => {
    const list = suppliersQuery.data ?? [];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.contact ?? "").toLowerCase().includes(q) ||
        (s.note ?? "").toLowerCase().includes(q),
    );
  }, [suppliersQuery.data, search]);

  // Если зашли в магазин не-grocery — отбрасываем (страница не для них).
  if (!isGrocery) {
    return <Navigate to="/sale" replace />;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Поставщики</h1>
          <p className="text-sm text-slate-500">
            Часто используемые — выше. Поиск по имени, телефону или описанию.
          </p>
        </div>
        {isOwner ? (
          <button
            type="button"
            onClick={() => {
              setForm(emptyForm);
              setShowForm(true);
            }}
            className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
          >
            <Plus size={16} /> Добавить
          </button>
        ) : null}
      </div>

      <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <Search size={16} className="text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Найти поставщика…"
          className="flex-1 bg-transparent text-sm focus:outline-none"
        />
      </div>

      {showForm && isOwner ? (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-semibold">
            {form.id ? "Редактировать поставщика" : "Новый поставщик"}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Имя агента или фирмы *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Например: ИП Иванов / ОсОО Сут"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Телефон</label>
              <input
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
                placeholder="+996 700 000 000"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-slate-500">
                Что поставляет (описание продукции)
              </label>
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Например: молочка, хлеб, овощи"
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={!form.name.trim() || saveMutation.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {saveMutation.isPending ? "Сохраняю…" : "Сохранить"}
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(emptyForm);
                setShowForm(false);
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}

      {suppliersQuery.isLoading ? (
        <p className="text-sm text-slate-500">Загрузка…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          {search ? "Ничего не найдено" : "Поставщиков пока нет. Нажми «Добавить» или они появятся автоматически после первого прихода."}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((s) => (
            <div
              key={s.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <div className="rounded-lg bg-indigo-50 p-2 text-primary">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-800">{s.name}</h3>
                    <p className="text-xs text-slate-500">
                      Использован в приходах: <span className="font-semibold text-slate-700">{s.usage_count}</span>
                    </p>
                  </div>
                </div>
                {isOwner ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setForm({
                          id: s.id,
                          name: s.name,
                          contact: s.contact ?? "",
                          note: s.note ?? "",
                        });
                        setShowForm(true);
                      }}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
                      title="Редактировать"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Удалить поставщика «${s.name}»?`)) {
                          deleteMutation.mutate(s.id);
                        }
                      }}
                      className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                      title="Удалить"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : null}
              </div>
              {s.contact ? (
                <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-700">
                  <Phone size={14} className="text-slate-400" />
                  <a href={`tel:${s.contact}`} className="hover:text-primary">
                    {s.contact}
                  </a>
                </p>
              ) : null}
              {s.note ? (
                <p className="mt-2 text-sm text-slate-600">{s.note}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
