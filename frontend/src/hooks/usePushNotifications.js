import { useCallback, useEffect, useState } from "react";
import api from "../lib/api";
/** VAPID-ключ приходит base64url из бэка → нужно превратить в Uint8Array
 *  для PushManager.subscribe({ applicationServerKey }). Явно создаём буфер
 *  внутри ArrayBuffer (а не SharedArrayBuffer) — иначе TS 5.7+ ругается на BufferSource. */
function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = window.atob(base64);
    const out = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++)
        out[i] = raw.charCodeAt(i);
    return out;
}
/** iOS Web Push работает только из PWA, установленного на главный экран,
 *  и только iOS 16.4+. Этот детект запускает онбординг для iOS-пользователей. */
function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function isStandalone() {
    // iOS-specific
    if (navigator.standalone === true)
        return true;
    // Стандартный display-mode
    return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}
export function usePushNotifications() {
    const [status, setStatus] = useState("loading");
    const [error, setError] = useState(null);
    const refresh = useCallback(async () => {
        setError(null);
        if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
            setStatus("unsupported");
            return;
        }
        if (isIOS() && !isStandalone()) {
            setStatus("ios-not-pwa");
            return;
        }
        try {
            const reg = await navigator.serviceWorker.ready;
            const existing = await reg.pushManager.getSubscription();
            if (Notification.permission === "denied") {
                setStatus("denied");
                return;
            }
            if (!existing || Notification.permission !== "granted") {
                setStatus("off");
                return;
            }
            // Сверяем с сервером — подписка могла быть отозвана с другого устройства
            // (admin удалил из БД, или endpoint протух и был удалён фоном).
            try {
                const { data } = await api.get("/push/status", {
                    params: { endpoint: existing.endpoint },
                });
                setStatus(data.subscribed ? "on" : "off");
            }
            catch {
                setStatus("on"); // локально подписка есть — считаем включённой
            }
        }
        catch (e) {
            setError(e?.message || "Не удалось проверить подписку");
            setStatus("error");
        }
    }, []);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    const enable = useCallback(async () => {
        setError(null);
        try {
            if (Notification.permission === "default") {
                const perm = await Notification.requestPermission();
                if (perm !== "granted") {
                    setStatus(perm === "denied" ? "denied" : "off");
                    return;
                }
            }
            else if (Notification.permission === "denied") {
                setStatus("denied");
                return;
            }
            const { data: keyData } = await api.get("/push/vapid-public-key");
            if (!keyData.publicKey) {
                setError("VAPID-ключ не настроен на сервере");
                setStatus("error");
                return;
            }
            const reg = await navigator.serviceWorker.ready;
            let sub = await reg.pushManager.getSubscription();
            if (!sub) {
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
                });
            }
            const json = sub.toJSON();
            await api.post("/push/subscribe", {
                endpoint: json.endpoint,
                keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
                user_agent: navigator.userAgent.slice(0, 500),
            });
            setStatus("on");
        }
        catch (e) {
            setError(e?.message || "Не удалось включить уведомления");
            setStatus("error");
        }
    }, []);
    const disable = useCallback(async () => {
        setError(null);
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                await api.post("/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => { });
                await sub.unsubscribe();
            }
            setStatus("off");
        }
        catch (e) {
            setError(e?.message || "Не удалось отключить");
            setStatus("error");
        }
    }, []);
    return { status, error, enable, disable, refresh };
}
