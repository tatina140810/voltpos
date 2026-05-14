import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheProducts, getCachedProducts, queueOfflineSale, syncOfflineSales } from "../offline";
import { api } from "../api";
// Моким axios клиент: один и тот же объект отдаём и как default, и как named "api",
// чтобы в коде offline.ts (named import) и в тесте (проверка вызовов) была одна мок-функция.
vi.mock("../api", () => {
    const mock = { post: vi.fn().mockResolvedValue({ data: [] }) };
    return { default: mock, api: mock };
});
async function resetIndexedDb() {
    // deleteDatabase висит, пока openDb из offline.ts держит соединение — оно не закрывается явно.
    // Поэтому чистим явно: открываем БД и вытираем оба store'а.
    await new Promise((resolve, reject) => {
        const req = indexedDB.open("voltpos-offline-db", 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains("products"))
                db.createObjectStore("products", { keyPath: "id" });
            if (!db.objectStoreNames.contains("offlineQueue"))
                db.createObjectStore("offlineQueue", { keyPath: "offline_id" });
        };
        req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction(["products", "offlineQueue"], "readwrite");
            tx.objectStore("products").clear();
            tx.objectStore("offlineQueue").clear();
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
    });
}
describe("offline.ts — IndexedDB cache + queue", () => {
    beforeEach(async () => {
        await resetIndexedDb();
    });
    afterEach(() => {
        vi.clearAllMocks();
    });
    it("cacheProducts + getCachedProducts: товары сохраняются и читаются", async () => {
        await cacheProducts([
            { id: 1, name: "Молоток", barcode: "1111", sale_price: 350 },
            { id: 2, name: "Отвёртка", barcode: "2222", sale_price: 120 },
        ]);
        const cached = await getCachedProducts();
        expect(cached).toHaveLength(2);
        expect(cached.map((p) => p.id).sort()).toEqual([1, 2]);
    });
    it("cacheProducts replace=true чистит кэш перед записью", async () => {
        await cacheProducts([{ id: 1, name: "old", barcode: "1", sale_price: 100 }]);
        await cacheProducts([{ id: 2, name: "new", barcode: "2", sale_price: 200 }], { replace: true });
        const cached = await getCachedProducts();
        expect(cached).toHaveLength(1);
        expect(cached[0].id).toBe(2);
    });
    it("cacheProducts без replace мерджит товары", async () => {
        await cacheProducts([{ id: 1, name: "a", barcode: "1", sale_price: 100 }]);
        await cacheProducts([{ id: 2, name: "b", barcode: "2", sale_price: 200 }]);
        const cached = await getCachedProducts();
        expect(cached).toHaveLength(2);
    });
    it("queueOfflineSale возвращает offline_id и добавляет его в payload", async () => {
        const offlineId = await queueOfflineSale({ total: "200", items: [] });
        expect(offlineId).toMatch(/^[0-9a-f-]{36}$/i); // UUID
    });
    it("syncOfflineSales отправляет очередь в /sales/sync", async () => {
        Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
        await queueOfflineSale({ total: "100" });
        await queueOfflineSale({ total: "200" });
        const synced = await syncOfflineSales();
        expect(synced).toBe(2);
        expect(api.post).toHaveBeenCalledWith("/sales/sync", expect.any(Array));
        expect(api.post.mock.calls[0][1]).toHaveLength(2);
        // После синхронизации очередь должна быть пуста — повторный sync вернёт 0.
        const second = await syncOfflineSales();
        expect(second).toBe(0);
    });
    it("syncOfflineSales offline-режим — ничего не делает", async () => {
        Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
        await queueOfflineSale({ total: "100" });
        const synced = await syncOfflineSales();
        expect(synced).toBe(0);
        expect(api.post).not.toHaveBeenCalled();
    });
});
