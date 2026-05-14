import { api } from "./api";

const DB_NAME = "voltpos-offline-db";
const DB_VERSION = 1;
const PRODUCTS_STORE = "products";
const QUEUE_STORE = "offlineQueue";

type CachedProduct = {
  id: number;
  name: string;
  barcode: string;
  sale_price: number;
  min_stock?: number;
};

type QueuedSale = {
  offline_id: string;
  payload: Record<string, unknown>;
  created_at: string;
};

function openDb(): Promise<IDBDatabase> {
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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheProducts(
  products: CachedProduct[],
  options?: { replace?: boolean },
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PRODUCTS_STORE, "readwrite");
    const store = tx.objectStore(PRODUCTS_STORE);
    // replace=true — полная синхронизация (используется при prefetch всего каталога).
    // Без флага — merge: search-запросы дополняют кеш, не стирая ранее закешированные товары.
    if (options?.replace) store.clear();
    products.forEach((product) => store.put(product));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedProducts(): Promise<CachedProduct[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRODUCTS_STORE, "readonly");
    const request = tx.objectStore(PRODUCTS_STORE).getAll();
    request.onsuccess = () => resolve(request.result as CachedProduct[]);
    request.onerror = () => reject(request.error);
  });
}

export async function queueOfflineSale(payload: Record<string, unknown>): Promise<string> {
  const offlineId = crypto.randomUUID();
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).put({
      offline_id: offlineId,
      payload: { ...payload, offline_id: offlineId },
      created_at: new Date().toISOString(),
    } satisfies QueuedSale);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return offlineId;
}

async function getQueuedSales(): Promise<QueuedSale[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const request = tx.objectStore(QUEUE_STORE).getAll();
    request.onsuccess = () => resolve(request.result as QueuedSale[]);
    request.onerror = () => reject(request.error);
  });
}

async function deleteQueuedSale(offlineId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).delete(offlineId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function syncOfflineSales(): Promise<number> {
  if (!navigator.onLine) return 0;
  const queued = await getQueuedSales();
  if (!queued.length) return 0;

  await api.post(
    "/sales/sync",
    queued.map((item) => item.payload),
  );

  for (const item of queued) {
    await deleteQueuedSale(item.offline_id);
  }
  return queued.length;
}
