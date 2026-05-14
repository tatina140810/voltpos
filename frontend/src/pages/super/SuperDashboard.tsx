import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { superApi } from "../../lib/superApi";

type Stats = {
  total_orgs: number;
  active_orgs: number;
  blocked_orgs: number;
  no_payment_set: number;
  monthly_revenue: number;
  expiring_soon: number;
};

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-bold text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

export function SuperDashboard() {
  const { data, isLoading, isError } = useQuery<Stats>({
    queryKey: ["super", "stats"],
    queryFn: async () => (await superApi.get<Stats>("/super/stats")).data,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Обзор платформы</h1>
        <Link
          to="/super/orgs"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Все магазины →
        </Link>
      </div>

      {isLoading ? <p className="text-slate-500">Загрузка...</p> : null}
      {isError ? <p className="text-rose-600">Не удалось загрузить статистику.</p> : null}

      {data ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <StatCard label="Магазинов всего" value={data.total_orgs} />
          <StatCard label="Активных" value={data.active_orgs} />
          <StatCard label="Заблокированных" value={data.blocked_orgs} hint="Просрочка или вручную" />
          <StatCard label="Без подписки" value={data.no_payment_set} hint="paid_until не задан" />
          <StatCard
            label="Доход в месяц"
            value={`${data.monthly_revenue.toLocaleString("ru-RU")} ₽`}
            hint="Сумма monthly_fee активных"
          />
          <StatCard label="Истекают за 7 дней" value={data.expiring_soon} hint="Стоит напомнить" />
        </div>
      ) : null}
    </div>
  );
}
