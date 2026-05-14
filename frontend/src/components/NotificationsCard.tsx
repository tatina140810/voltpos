import { usePushNotifications } from "../hooks/usePushNotifications";

/** Карточка управления push-уведомлениями для владельца.
 *  Размещается на странице Reports (owner-only). Сама внутри роли не проверяет —
 *  если попадёт другому пользователю, бэк вернёт 403 на /push/subscribe. */
export function NotificationsCard() {
  const { status, error, enable, disable } = usePushNotifications();

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">Push-уведомления</div>
          <div className="mt-1 text-xs text-slate-600">
            Получайте на телефон уведомления о продажах, возвратах, списаниях и инкассации.
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {status === "ios-not-pwa" && (
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          На iPhone уведомления работают только из приложения, установленного на главный экран.
          Откройте VoltPos в Safari → нажмите <b>«Поделиться»</b> → <b>«На экран Домой»</b>.
          После установки откройте приложение с домашнего экрана и снова зайдите сюда.
        </div>
      )}

      {status === "unsupported" && (
        <div className="mt-3 rounded-xl bg-slate-100 p-3 text-xs text-slate-700">
          Этот браузер не поддерживает push-уведомления.
        </div>
      )}

      {status === "denied" && (
        <div className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-900">
          Уведомления заблокированы в браузере. Откройте настройки сайта и разрешите уведомления для VoltPos.
        </div>
      )}

      {error && status === "error" && (
        <div className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-900">{error}</div>
      )}

      <div className="mt-3 flex gap-2">
        {status === "on" ? (
          <button
            onClick={() => void disable()}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            Отключить
          </button>
        ) : (
          <button
            onClick={() => void enable()}
            disabled={status === "ios-not-pwa" || status === "unsupported" || status === "loading"}
            className="rounded-xl bg-primary px-3 py-2 text-sm text-white shadow disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "loading" ? "Проверка…" : "Включить уведомления"}
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    on: { label: "Включено", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    off: { label: "Выключено", cls: "bg-slate-100 text-slate-700 border-slate-200" },
    denied: { label: "Заблокировано", cls: "bg-rose-50 text-rose-700 border-rose-200" },
    "ios-not-pwa": { label: "Нужна установка PWA", cls: "bg-amber-50 text-amber-800 border-amber-200" },
    unsupported: { label: "Не поддерживается", cls: "bg-slate-100 text-slate-600 border-slate-200" },
    error: { label: "Ошибка", cls: "bg-rose-50 text-rose-700 border-rose-200" },
    loading: { label: "…", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  };
  const m = map[status] ?? map.loading;
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}
