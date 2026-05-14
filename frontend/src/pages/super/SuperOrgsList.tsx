import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { superApi } from "../../lib/superApi";

type Org = {
  id: number;
  name: string;
  org_code: string;
  slug: string;
  plan: string;
  is_active: boolean;
  monthly_fee: number | null;
  paid_until: string | null;
  category: string | null;
  employees_count: number;
  status: "active" | "blocked" | "no_payment_set";
  days_left: number | null;
  created_at: string;
};

const statusLabel: Record<Org["status"], { text: string; classes: string }> = {
  active: { text: "Активен", classes: "bg-emerald-100 text-emerald-700" },
  blocked: { text: "Заблокирован", classes: "bg-rose-100 text-rose-700" },
  no_payment_set: { text: "Без подписки", classes: "bg-amber-100 text-amber-700" },
};

function formatPaidUntil(org: Org): string {
  if (!org.paid_until) return "—";
  const date = new Date(org.paid_until + "T00:00:00").toLocaleDateString("ru-RU");
  if (org.days_left == null) return date;
  if (org.days_left < 0) return `${date} (просрочка ${Math.abs(org.days_left)} дн)`;
  if (org.days_left <= 7) return `${date} (через ${org.days_left} дн)`;
  return date;
}

export function SuperOrgsList() {
  const { data, isLoading, isError } = useQuery<Org[]>({
    queryKey: ["super", "orgs"],
    queryFn: async () => (await superApi.get<Org[]>("/super/orgs")).data,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Магазины</h1>
        <Link
          to="/super/orgs/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          + Добавить магазин
        </Link>
      </div>

      {isLoading ? <p className="text-slate-500">Загрузка...</p> : null}
      {isError ? <p className="text-rose-600">Не удалось загрузить список.</p> : null}

      {data ? (
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Название</th>
                <th className="px-4 py-3">Тип</th>
                <th className="px-4 py-3">Код</th>
                <th className="px-4 py-3">Сотрудников</th>
                <th className="px-4 py-3">Цена/мес</th>
                <th className="px-4 py-3">Оплачено до</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    Магазинов пока нет. Нажмите «+ Добавить магазин».
                  </td>
                </tr>
              ) : null}
              {data.map((org) => {
                const status = statusLabel[org.status];
                return (
                  <tr key={org.id} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{org.name}</td>
                    <td className="px-4 py-3 text-slate-600">{org.category || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{org.org_code}</td>
                    <td className="px-4 py-3 text-slate-700">{org.employees_count}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {org.monthly_fee != null ? `${org.monthly_fee.toLocaleString("ru-RU")} ₽` : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatPaidUntil(org)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs ${status.classes}`}>
                        {status.text}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/super/orgs/${org.id}`} className="text-sm text-blue-600 hover:underline">
                        Открыть →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
