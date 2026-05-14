import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from "react";
export function OfflineBanner() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    useEffect(() => {
        const goOnline = () => setIsOnline(true);
        const goOffline = () => setIsOnline(false);
        window.addEventListener("online", goOnline);
        window.addEventListener("offline", goOffline);
        return () => {
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
        };
    }, []);
    if (isOnline)
        return null;
    return (_jsx("div", { className: "sticky top-0 z-50 mb-3 rounded-xl bg-amber-100 px-4 py-3 text-sm font-medium text-amber-900", children: "\u0420\u0430\u0431\u043E\u0442\u0430\u044E \u043E\u0444\u043B\u0430\u0439\u043D \u2014 \u043F\u0440\u043E\u0434\u0430\u0436\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F" }));
}
