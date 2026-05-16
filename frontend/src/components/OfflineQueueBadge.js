import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { AlertTriangle, CloudOff, Trash2 } from "lucide-react";
import { deleteFailedSale, getFailedSales, getQueueStats, syncOfflineSales, } from "../lib/offline";
export function OfflineQueueBadge() {
    const [stats, setStats] = useState(null);
    const [showFailed, setShowFailed] = useState(false);
    const [failedItems, setFailedItems] = useState([]);
    const refresh = async () => {
        try {
            setStats(await getQueueStats());
        }
        catch {
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
            getFailedSales().then((rows) => setFailedItems(rows)).catch(() => setFailedItems([]));
        }
    }, [showFailed]);
    if (!stats || (stats.pending === 0 && stats.failed === 0))
        return null;
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(CloudOff, { size: 16, className: "text-amber-700" }), stats.pending > 0 ? (_jsxs("span", { className: "text-amber-800", children: ["\uD83D\uDCF4 ", _jsx("b", { children: stats.pending }), " \u043F\u0440\u043E\u0434\u0430\u0436 \u0436\u0434\u0443\u0442 \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440", navigator.onLine ? " (синк идёт автоматически)" : " — нет интернета"] })) : null, stats.failed > 0 ? (_jsxs("span", { className: "text-red-700", children: [_jsx(AlertTriangle, { size: 14, className: "mr-1 inline" }), _jsx("b", { children: stats.failed }), " \u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C"] })) : null] }), _jsxs("div", { className: "flex gap-2", children: [stats.pending > 0 ? (_jsx("button", { type: "button", onClick: () => syncOfflineSales().finally(refresh), className: "rounded-lg border border-amber-400 px-3 py-1 text-xs hover:bg-amber-100", children: "\u041F\u043E\u043F\u0440\u043E\u0431\u043E\u0432\u0430\u0442\u044C \u0441\u0438\u043D\u043A" })) : null, stats.failed > 0 ? (_jsx("button", { type: "button", onClick: () => setShowFailed(true), className: "rounded-lg border border-red-400 px-3 py-1 text-xs text-red-700 hover:bg-red-50", children: "\u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C \u043E\u0448\u0438\u0431\u043A\u0438" })) : null] })] }), showFailed ? (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4", onClick: () => setShowFailed(false), children: _jsxs("div", { className: "max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-4 shadow-xl", onClick: (e) => e.stopPropagation(), children: [_jsxs("h3", { className: "mb-2 text-lg font-semibold text-red-700", children: ["\u26A0 \u041F\u0440\u043E\u0434\u0430\u0436\u0438 \u0441 \u043E\u0448\u0438\u0431\u043A\u043E\u0439 \u0441\u0438\u043D\u043A\u0430 (", failedItems.length, ")"] }), _jsx("p", { className: "mb-3 text-xs text-slate-500", children: "\u042D\u0442\u0438 \u043F\u0440\u043E\u0434\u0430\u0436\u0438 \u0441\u0435\u0440\u0432\u0435\u0440 \u043E\u0442\u0432\u0435\u0440\u0433 (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0438\u043B\u0438 \u0442\u043E\u0432\u0430\u0440 \u0443\u0434\u0430\u043B\u0451\u043D). \u041F\u0440\u043E\u0432\u0435\u0440\u044C \u0434\u0430\u043D\u043D\u044B\u0435 \u0438 \u0443\u0434\u0430\u043B\u0438 \u0437\u0430\u043F\u0438\u0441\u044C \u2014 \u043E\u043D\u0430 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438." }), failedItems.length === 0 ? (_jsx("p", { className: "text-sm text-slate-500", children: "\u041F\u0443\u0441\u0442\u043E." })) : (_jsx("ul", { className: "space-y-2", children: failedItems.map((it) => (_jsxs("li", { className: "rounded-lg border border-red-200 bg-red-50 p-2 text-xs", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsxs("span", { className: "font-semibold", children: [(it.payload?.total ?? 0).toFixed(2), " \u0441\u043E\u043C"] }), _jsx("button", { type: "button", onClick: async () => {
                                                    if (window.confirm("Удалить эту продажу из карантина? Восстановить не получится.")) {
                                                        await deleteFailedSale(it.offline_id);
                                                        const rows = await getFailedSales();
                                                        setFailedItems(rows);
                                                        refresh();
                                                    }
                                                }, className: "rounded p-1 text-slate-500 hover:bg-red-100 hover:text-red-700", title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C", children: _jsx(Trash2, { size: 14 }) })] }), _jsxs("p", { className: "mt-1 text-[11px] text-slate-600", children: ["\u0441\u043E\u0437\u0434\u0430\u043D\u043E: ", new Date(it.created_at).toLocaleString("ru-RU"), _jsx("br", {}), "\u0443\u043F\u0430\u043B\u043E: ", new Date(it.failed_at).toLocaleString("ru-RU"), " (HTTP ", it.http_status, ")"] }), _jsx("p", { className: "mt-1 text-[11px] font-mono text-red-700", children: it.error_message })] }, it.offline_id))) })), _jsx("button", { type: "button", onClick: () => setShowFailed(false), className: "mt-3 w-full rounded-lg bg-slate-100 px-4 py-2 text-sm hover:bg-slate-200", children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })] }) })) : null] }));
}
