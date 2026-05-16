import axios from "axios";
import { api } from "./api";
const DB_NAME = "voltpos-offline-db";
// v2: добавлен FAILED_STORE для «карантина» продаж с 4xx-ошибкой синка.
const DB_VERSION = 2;
const PRODUCTS_STORE = "products";
const QUEUE_STORE = "offlineQueue";
const FAILED_STORE = "failedQueue";
function openDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(PRODUCTS_STORE)) {
                db.createObjectStore(PRODUCTS_STORE, { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains(QUEUE_STORE)) {
                db.createObjectStore(QUEUE_STORE, { keyPath: "offline_id" });
            }
            // v2: карантин для продаж, которые сервер отверг 4xx-ошибкой.
            if (!db.objectStoreNames.contains(FAILED_STORE)) {
                db.createObjectStore(FAILED_STORE, { keyPath: "offline_id" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
export async function cacheProducts(products, options) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(PRODUCTS_STORE, "readwrite");
        const store = tx.objectStore(PRODUCTS_STORE);
        // replace=true — полная синхронизация (используется при prefetch всего каталога).
        // Без флага — merge: search-запросы дополняют кеш, не стирая ранее закешированные товары.
        if (options?.replace)
            store.clear();
        products.forEach((product) => store.put(product));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
export async function getCachedProducts() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(PRODUCTS_STORE, "readonly");
        const request = tx.objectStore(PRODUCTS_STORE).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
export async function queueOfflineSale(payload) {
    const offlineId = crypto.randomUUID();
    const db = await openDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(QUEUE_STORE, "readwrite");
        tx.objectStore(QUEUE_STORE).put({
            offline_id: offlineId,
            payload: { ...payload, offline_id: offlineId },
            created_at: new Date().toISOString(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    return offlineId;
}
async function getQueuedSales() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(QUEUE_STORE, "readonly");
        const request = tx.objectStore(QUEUE_STORE).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
async function deleteQueuedSale(offlineId) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(QUEUE_STORE, "readwrite");
        tx.objectStore(QUEUE_STORE).delete(offlineId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
async function moveToFailed(item, httpStatus, errorMessage) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction([QUEUE_STORE, FAILED_STORE], "readwrite");
        tx.objectStore(FAILED_STORE).put({
            ...item,
            failed_at: new Date().toISOString(),
            http_status: httpStatus,
            error_message: errorMessage,
        });
        tx.objectStore(QUEUE_STORE).delete(item.offline_id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
export async function getFailedSales() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(FAILED_STORE, "readonly");
        const request = tx.objectStore(FAILED_STORE).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
export async function deleteFailedSale(offlineId) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(FAILED_STORE, "readwrite");
        tx.objectStore(FAILED_STORE).delete(offlineId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
export async function getQueueStats() {
    const [pending, failed] = await Promise.all([getQueuedSales(), getFailedSales()]);
    return { pending: pending.length, failed: failed.length };
}
export async function syncOfflineSales() {
    if (!navigator.onLine)
        return 0;
    const queued = await getQueuedSales();
    if (!queued.length)
        return 0;
    // Шлём по одной, чтобы один «битый» чек не блокировал всю очередь.
    // 4xx (валидация / недостаток остатка / etc) → карантин, кассир увидит и решит.
    // 5xx / сетевые / таймаут → оставляем в очереди, попробуем снова при следующем syncOfflineSales.
    let synced = 0;
    for (const item of queued) {
        try {
            await api.post("/sales/sync", [item.payload]);
            await deleteQueuedSale(item.offline_id);
            synced += 1;
        }
        catch (err) {
            const status = axios.isAxiosError(err) ? err.response?.status ?? 0 : 0;
            const detail = axios.isAxiosError(err)
                ? typeof err.response?.data?.detail === "string"
                    ? err.response.data.detail
                    : err.message
                : String(err);
            // 4xx — постоянная ошибка, не имеет смысла ретраить. В карантин.
            if (status >= 400 && status < 500) {
                await moveToFailed(item, status, detail);
            }
            // 5xx / 0 (сетевая) — выходим из цикла, попробуем позже.
            // Но если 4xx — продолжаем со следующей.
            if (status >= 500 || status === 0) {
                break;
            }
        }
    }
    return synced;
}
