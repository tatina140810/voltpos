import { useEffect, useState } from "react";
import { AlertTriangle, CloudOff, Trash2 } from "lucide-react";

import {
  deleteFailedSale,
  getFailedSales,
  getQueueStats,
  syncOfflineSales,
} from "../lib/offline";

type FailedSale = {
  offline_id: string;
  created_at: string;
  failed_at: string;
  http_status: number;
  error_message: string;
  payload: { total?: number };
};

export function OfflineQueueBadge() {
  const [stats, setStats] = useState<{ pending: number; failed: number } | null>(null);
  const [showFailed, setShowFailed] = useState(false);
  const [failedItems, setFailedItems] = useState<FailedSale[]>([]);

  const refresh = async () => {
    try {
      setStats(await getQueueStats());
    } catch {
      /* IndexedDB может быть недоступен в приватном режиме */
    }
  };

  useEffect(() => {
    refresh();
    // Обновляем каждые 10 сек: после авто-синка число может уменьшиться.
    const id = setInterval(refresh, 10000);
    // И при возврате интернета.
    const onlineHandler = () => {
      void syncOfflineSales().finally(refresh);
    };
    window.addEventListener("online", onlineHandler);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", onlineHandler);
    };
  }, []);

  useEffect(() => {
    if (showFailed) {
      getFailedSales().then((rows) => setFailedItems(rows as FailedSale[])).catch(() => setFailedItems([]));
    }
  }, [showFailed]);

  if (!stats || (stats.pending === 0 && stats.failed === 0)) return null;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
        <div className="flex items-center gap-2">
          <CloudOff size={16} className="text-amber-700" />
          {stats.pending > 0 ? (
            <span className="text-amber-800">
              📴 <b>{stats.pending}</b> продаж ждут отправки на сервер
              {navigator.onLine ? " (синк идёт автоматически)" : " — нет интернета"}
            </span>
          ) : null}
          {stats.failed > 0 ? (
            <span className="text-red-700">
              <AlertTriangle size={14} className="mr-1 inline" />
              <b>{stats.failed}</b> не удалось сохранить
            </span>
          ) : null}
        </div>
        <div className="flex gap-2">
          {stats.pending > 0 ? (
            <button
              type="button"
              onClick={() => syncOfflineSales().finally(refresh)}
              className="rounded-lg border border-amber-400 px-3 py-1 text-xs hover:bg-amber-100"
            >
              Попробовать синк
            </button>
          ) : null}
          {stats.failed > 0 ? (
            <button
              type="button"
              onClick={() => setShowFailed(true)}
              className="rounded-lg border border-red-400 px-3 py-1 text-xs text-red-700 hover:bg-red-50"
            >
              Посмотреть ошибки
            </button>
          ) : null}
        </div>
      </div>

      {showFailed ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowFailed(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-lg font-semibold text-red-700">
              ⚠ Продажи с ошибкой синка ({failedItems.length})
            </h3>
            <p className="mb-3 text-xs text-slate-500">
              Эти продажи сервер отверг (например, остаток отрицательный или товар удалён).
              Проверь данные и удали запись — она не отправится автоматически.
            </p>
            {failedItems.length === 0 ? (
              <p className="text-sm text-slate-500">Пусто.</p>
            ) : (
              <ul className="space-y-2">
                {failedItems.map((it) => (
                  <li key={it.offline_id} className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {(it.payload?.total ?? 0).toFixed(2)} сом
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm("Удалить эту продажу из карантина? Восстановить не получится.")) {
                            await deleteFailedSale(it.offline_id);
                            const rows = await getFailedSales();
                            setFailedItems(rows as FailedSale[]);
                            refresh();
                          }
                        }}
                        className="rounded p-1 text-slate-500 hover:bg-red-100 hover:text-red-700"
                        title="Удалить"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-600">
                      создано: {new Date(it.created_at).toLocaleString("ru-RU")}
                      <br />
                      упало: {new Date(it.failed_at).toLocaleString("ru-RU")} (HTTP {it.http_status})
                    </p>
                    <p className="mt-1 text-[11px] font-mono text-red-700">{it.error_message}</p>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setShowFailed(false)}
              className="mt-3 w-full rounded-lg bg-slate-100 px-4 py-2 text-sm hover:bg-slate-200"
            >
              Закрыть
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
