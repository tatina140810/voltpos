import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/library";
export function BarcodeScanner({ onDetected, onClose, embedded = false }) {
    const videoRef = useRef(null);
    const processingRef = useRef(false);
    const deviceIdRef = useRef(undefined);
    const restartingRef = useRef(false);
    /** Чередуем ширину между restart-ами (1280 ↔ 1920). iOS Safari «просыпается»
     *  только когда видит новый формат стрима — иначе автофокус не пересчитывается.*/
    const widthToggleRef = useRef(0);
    const [restarting, setRestarting] = useState(false);
    // Дебаунс по тексту: один и тот же штрихкод не дёргаем чаще раза в 2.5 сек.
    // Иначе при «не найден» сканер бесконечно повторяет тот же запрос → зависает.
    const lastScanRef = useRef({ text: "", at: 0 });
    /** Полностью отпустить камеру: остановить ZXing + явно остановить все треки. */
    const stopCamera = () => {
        try {
            reader.reset();
        }
        catch {
            // ignore
        }
        const video = videoRef.current;
        if (!video)
            return;
        const stream = video.srcObject;
        if (stream) {
            stream.getTracks().forEach((t) => {
                try {
                    t.stop();
                }
                catch {
                    // ignore
                }
            });
        }
        video.srcObject = null;
    };
    /** Перенавести автофокус через applyConstraints (быстрый, без перезапуска). */
    const refocus = async () => {
        const stream = videoRef.current?.srcObject;
        if (!stream)
            return;
        const track = stream.getVideoTracks()[0];
        if (!track || typeof track.applyConstraints !== "function")
            return;
        try {
            const caps = (track.getCapabilities?.() ?? {});
            const modes = caps.focusMode ?? [];
            if (modes.includes("manual") || modes.includes("single-shot")) {
                await track.applyConstraints({
                    // @ts-expect-error focusMode не типизирован
                    advanced: [{ focusMode: modes.includes("single-shot") ? "single-shot" : "manual" }],
                });
            }
            if (modes.includes("continuous")) {
                await track.applyConstraints({
                    // @ts-expect-error focusMode не типизирован
                    advanced: [{ focusMode: "continuous" }],
                });
            }
        }
        catch {
            // ignore
        }
    };
    const [error, setError] = useState("");
    const [flash, setFlash] = useState(null);
    const [frame, setFrame] = useState(null);
    const [statusText, setStatusText] = useState("");
    const [statusOk, setStatusOk] = useState(false);
    const reader = useMemo(() => new BrowserMultiFormatReader(), []);
    /** Constraints с чередующейся шириной — заставляет iOS пересоздать pipeline. */
    const buildConstraints = () => {
        widthToggleRef.current = (widthToggleRef.current + 1) % 2;
        const width = widthToggleRef.current === 0 ? 1280 : 1920;
        const height = widthToggleRef.current === 0 ? 720 : 1080;
        return {
            video: {
                facingMode: { ideal: "environment" },
                width: { ideal: width },
                height: { ideal: height },
                // @ts-expect-error focusMode не типизирован в lib.dom для всех платформ
                focusMode: { ideal: "continuous" },
            },
        };
    };
    const constraints = buildConstraints();
    const emitFeedback = (ok) => {
        try {
            if ("vibrate" in navigator) {
                navigator.vibrate(ok ? 100 : [100, 50, 100]);
            }
        }
        catch {
            // Ignore unsupported vibration API.
        }
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx)
                return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = ok ? 1200 : 300;
            gain.gain.value = 0.08;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + (ok ? 0.1 : 0.3));
            osc.onended = () => {
                void ctx.close();
            };
        }
        catch {
            // Ignore unsupported audio API.
        }
    };
    const applyScanUi = (ok, message) => {
        setFlash(ok ? "success" : "error");
        setFrame(ok ? "success" : "error");
        setStatusOk(ok);
        setStatusText(message);
        emitFeedback(ok);
        window.setTimeout(() => setFlash(null), 300);
        window.setTimeout(() => setFrame(null), 1000);
    };
    const cancelledRef = useRef(false);
    const onDetectedRef = useRef(onDetected);
    const onCloseRef = useRef(onClose);
    onDetectedRef.current = onDetected;
    onCloseRef.current = onClose;
    // Forward declarations через ref — handleDecoded должен видеть restartCamera.
    const restartCameraRef = useRef(async () => { });
    const handleDecoded = (text) => {
        if (cancelledRef.current || processingRef.current || restartingRef.current)
            return;
        const now = Date.now();
        if (lastScanRef.current.text === text && now - lastScanRef.current.at < 2500)
            return;
        lastScanRef.current = { text, at: now };
        processingRef.current = true;
        void (async () => {
            try {
                const feedback = await onDetectedRef.current(text);
                const ok = feedback?.ok ?? true;
                const message = feedback?.message ?? (ok ? `✓ Найден: ${text}` : `✗ Не найден: ${text}`);
                applyScanUi(ok, message);
                const shouldClose = feedback?.autoClose ?? true;
                if (shouldClose) {
                    window.setTimeout(() => onCloseRef.current(), 350);
                }
                else {
                    window.setTimeout(() => void restartCameraRef.current(), 600);
                }
            }
            catch (err) {
                applyScanUi(false, "Ошибка обработки скана");
                // eslint-disable-next-line no-console
                console.error(err);
            }
            finally {
                window.setTimeout(() => {
                    processingRef.current = false;
                }, 500);
            }
        })();
    };
    /** Запуск ZXing-декодера (первичный или после restart). */
    const startCamera = async () => {
        const videoElement = videoRef.current;
        if (!videoElement || cancelledRef.current)
            return;
        const decodeCallback = (result, decodeError) => {
            if (cancelledRef.current)
                return;
            if (result) {
                handleDecoded(result.getText());
                return;
            }
            if (decodeError && !(decodeError instanceof NotFoundException)) {
                // eslint-disable-next-line no-console
                console.error(decodeError);
            }
        };
        // Используем decodeFromConstraints с свежими constraints (чередующаяся ширина)
        // вместо decodeFromVideoDevice — iOS просыпается только при смене формата.
        await reader.decodeFromConstraints(buildConstraints(), videoElement, decodeCallback);
        window.setTimeout(() => void refocus(), 700);
    };
    /** Атомарный restart: stop камеры → пауза → start заново с другим разрешением. */
    restartCameraRef.current = async () => {
        if (restartingRef.current || cancelledRef.current)
            return;
        restartingRef.current = true;
        setRestarting(true);
        try {
            stopCamera();
            // Достаточная пауза, чтобы iOS реально отпустил камеру.
            await new Promise((r) => setTimeout(r, 500));
            if (cancelledRef.current)
                return;
            await startCamera();
        }
        finally {
            restartingRef.current = false;
            setRestarting(false);
        }
    };
    useEffect(() => {
        cancelledRef.current = false;
        const run = async () => {
            try {
                const videoInputDevices = await reader.listVideoInputDevices();
                if (!videoInputDevices.length) {
                    setError("Камера не найдена");
                    return;
                }
                const backCamera = videoInputDevices.find((device) => {
                    const label = device.label.toLowerCase();
                    return label.includes("back") || label.includes("rear") || label.includes("environment");
                }) || videoInputDevices[videoInputDevices.length - 1];
                deviceIdRef.current = backCamera?.deviceId;
                await startCamera();
            }
            catch {
                setError("Нет доступа к камере");
            }
        };
        void run();
        return () => {
            cancelledRef.current = true;
            stopCamera();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const stopTouchZoom = (e) => {
        if (e.touches.length > 1) {
            e.preventDefault();
        }
    };
    return (_jsx("div", { className: `${embedded ? "w-full" : "fixed inset-0 z-[9999] bg-black"} ${!embedded ? "touch-none select-none" : ""}`, onTouchMove: !embedded ? (e) => e.preventDefault() : undefined, children: embedded ? (_jsxs("div", { className: "mx-auto w-full max-w-md rounded-2xl bg-white p-3", children: [_jsxs("div", { className: "mb-2 flex items-center justify-between", children: [_jsx("p", { className: "font-medium", children: "\u0421\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0448\u0442\u0440\u0438\u0445-\u043A\u043E\u0434\u0430" }), _jsx("button", { type: "button", className: "rounded-lg px-3 py-1 text-xl leading-none text-slate-600", onClick: onClose, "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0441\u043A\u0430\u043D\u0435\u0440", children: "\u00D7" })] }), error ? (_jsx("div", { className: "rounded-xl bg-red-50 p-4 text-sm text-danger", children: error })) : (_jsxs("div", { className: "relative mx-auto w-full max-w-[360px] touch-none select-none", onTouchStart: stopTouchZoom, onTouchMove: stopTouchZoom, children: [_jsx("video", { ref: videoRef, playsInline: true, muted: true, autoPlay: true, onClick: () => void refocus(), className: `mx-auto block aspect-square w-full max-h-[min(70vh,360px)] rounded-xl bg-black object-contain transition-all ${frame === "success" ? "ring-4 ring-emerald-500" : ""} ${frame === "error" ? "ring-4 ring-red-500" : ""}` }), flash ? (_jsx("div", { className: `pointer-events-none absolute inset-0 rounded-xl transition-opacity duration-300 ${flash === "success" ? "bg-emerald-600/40" : "bg-red-600/35"}` })) : null] })), statusText ? (_jsx("p", { className: `mt-2 text-center text-sm font-medium ${statusOk ? "text-emerald-600" : "text-red-600"}`, children: statusText })) : null] })) : (_jsxs("div", { className: "relative h-full w-full touch-none select-none", onTouchStart: stopTouchZoom, onTouchMove: stopTouchZoom, children: [_jsx("video", { ref: videoRef, playsInline: true, muted: true, autoPlay: true, onClick: () => void refocus(), className: `h-full w-full bg-black object-contain transition-all ${frame === "success" ? "ring-4 ring-emerald-500" : ""} ${frame === "error" ? "ring-4 ring-red-500" : ""}` }), flash ? (_jsx("div", { className: `pointer-events-none absolute inset-0 transition-opacity duration-300 ${flash === "success" ? "bg-emerald-600/40" : "bg-red-600/35"}` })) : null, restarting ? (_jsxs("div", { className: "pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/85 text-white", children: [_jsx("div", { className: "mb-3 h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" }), _jsx("p", { className: "text-sm", children: "\u041F\u0435\u0440\u0435\u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430 \u0444\u043E\u043A\u0443\u0441\u0430..." })] })) : null, _jsx("button", { type: "button", className: "absolute right-5 top-5 z-10 h-11 w-11 touch-manipulation rounded-full bg-black/60 text-2xl leading-none text-white", onClick: onClose, "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0441\u043A\u0430\u043D\u0435\u0440", children: "\u00D7" }), _jsx("div", { className: "pointer-events-none absolute left-1/2 top-1/2 h-[200px] w-[200px] -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" }), _jsx("p", { className: "pointer-events-none absolute left-1/2 top-[calc(50%+120px)] max-w-[90vw] -translate-x-1/2 px-2 text-center text-sm leading-snug text-white drop-shadow-md", children: "\u041D\u0430\u0432\u0435\u0434\u0438\u0442\u0435 \u043A\u0430\u043C\u0435\u0440\u0443 \u043D\u0430 \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434" }), _jsx("p", { className: "pointer-events-none absolute left-1/2 top-[calc(50%+168px)] max-w-[90vw] -translate-x-1/2 px-2 text-center text-xs leading-snug text-white/85 drop-shadow-md", children: "\u0414\u0435\u0440\u0436\u0438\u0442\u0435 15\u201325 \u0441\u043C. \u0415\u0441\u043B\u0438 \u0440\u0430\u0441\u0444\u043E\u043A\u0443\u0441 \u2014 \u0442\u0430\u043F\u043D\u0438\u0442\u0435 \u043F\u043E \u044D\u043A\u0440\u0430\u043D\u0443" }), error ? (_jsx("p", { className: "absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-red-600/90 px-3 py-2 text-sm text-white", children: error })) : null, statusText ? (_jsx("p", { className: `absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg px-3 py-2 text-sm font-medium ${statusOk ? "bg-emerald-600/90 text-white" : "bg-red-600/90 text-white"}`, children: statusText })) : null] })) }));
}
