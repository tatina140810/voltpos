import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";

import { superApi } from "../lib/superApi";

/** Конвертирует base64url VAPID-ключ в Uint8Array (требование SubscribeOptions). */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i);
  return out;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function SuperPushButton() {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

  useEffect(() => {
    if (!supported) return;
    superApi.get("/super/push/status")
      .then((r) => setSubscribed(Boolean(r.data?.subscribed)))
      .catch(() => setSubscribed(false));
  }, [supported]);

  if (!supported) {
    return (
      <span className="text-xs text-slate-400" title="Браузер не поддерживает Web Push">
        🔕 push не поддерживается
      </span>
    );
  }

  const subscribe = async () => {
    setBusy(true);
    try {
      // 1. permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        alert("Разрешите уведомления в настройках браузера, чтобы получать push.");
        return;
      }
      // 2. register SW (ставим на скоупе /super/ — отдельная PWA-инсталляция).
      // Если у юзера уже стоит обычная PWA — браузер не конфликтует, скоупы разные.
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/super/" });
      await navigator.serviceWorker.ready;
      // 3. достаём публичный VAPID
      const vapidRes = await superApi.get("/super/push/vapid-key");
      const pubKey = vapidRes.data?.public_key as string;
      if (!pubKey) {
        alert("VAPID-ключ не настроен на сервере.");
        return;
      }
      // 4. подписываемся
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // TS strict: PushManager хочет ArrayBuffer (не Shared). Наш Uint8Array
        // создан над обычным ArrayBuffer — приводим явно через cast.
        applicationServerKey: urlBase64ToUint8Array(pubKey) as BufferSource,
      });
      const json = sub.toJSON();
      await superApi.post("/super/push/subscribe", {
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? arrayBufferToBase64(sub.getKey("p256dh")),
        auth: json.keys?.auth ?? arrayBufferToBase64(sub.getKey("auth")),
      });
      setSubscribed(true);
    } catch (e) {
      console.error(e);
      alert("Не удалось включить уведомления. Проверь, что сайт открыт по HTTPS и SW поддерживается.");
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/super/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await superApi.delete("/super/push/unsubscribe", { data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      console.error(e);
      alert("Не удалось отключить.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={subscribed ? unsubscribe : subscribe}
      disabled={busy || subscribed === null}
      className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50 ${
        subscribed
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-slate-300 text-slate-700 hover:bg-slate-100"
      }`}
      title={subscribed ? "Push-уведомления включены" : "Включить push-уведомления"}
    >
      {subscribed ? <Bell size={14} /> : <BellOff size={14} />}
      {busy ? "…" : subscribed ? "Уведомл. вкл." : "Уведомления"}
    </button>
  );
}
