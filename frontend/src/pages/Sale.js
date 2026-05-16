import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { NumberInput } from "../components/NumberInput";
import { ShiftWidget } from "../components/ShiftWidget";
import { useBusinessSettings } from "../hooks/useBusinessSettings";
import { api } from "../lib/api";
import { cacheProducts, getCachedProducts, queueOfflineSale } from "../lib/offline";
export function SalePage() {
    const { hasDelivery, hasFastCheckout, hasWeightScale } = useBusinessSettings();
    const searchRef = useRef(null);
    const pluWeightRef = useRef(null);
    const [pluCode, setPluCode] = useState("");
    const [pluWeight, setPluWeight] = useState("");
    const newCustomerNameRef = useRef(null);
    const [search, setSearch] = useState("");
    const [showScanner, setShowScanner] = useState(false);
    // Сессия сканера: меняется при каждом открытии, чтобы React гарантированно
    // пересоздал компонент и MediaStream (фикс для iOS, который не отдаёт камеру быстро).
    const [scannerSession, setScannerSession] = useState(0);
    const [showCheckoutMobile, setShowCheckoutMobile] = useState(false);
    const [cart, setCart] = useState([]);
    const [message, setMessage] = useState("");
    const [recentAddedProductId, setRecentAddedProductId] = useState(null);
    const [successOverlay, setSuccessOverlay] = useState(null);
    const [customerPhone, setCustomerPhone] = useState("");
    const [customer, setCustomer] = useState(null);
    const [showCreateCustomer, setShowCreateCustomer] = useState(false);
    const [newCustomerName, setNewCustomerName] = useState("");
    const [newCustomerPhone, setNewCustomerPhone] = useState("");
    const [newCustomerDiscount, setNewCustomerDiscount] = useState("");
    const [paymentMode, setPaymentMode] = useState("cash");
    const [splitPayment, setSplitPayment] = useState(false);
    const [paidCashInput, setPaidCashInput] = useState("");
    const [paidCardInput, setPaidCardInput] = useState("");
    const [paidTransferInput, setPaidTransferInput] = useState("");
    const [receivedInput, setReceivedInput] = useState("");
    const [needDelivery, setNeedDelivery] = useState(false);
    const [deliveryAddress, setDeliveryAddress] = useState("");
    const [deliveryDate, setDeliveryDate] = useState("");
    const [deliveryPriceInput, setDeliveryPriceInput] = useState("");
    const [deliveryType, setDeliveryType] = useState("separate");
    const [needInstallation, setNeedInstallation] = useState(false);
    const [installationPriceInput, setInstallationPriceInput] = useState("");
    const [saleType, setSaleType] = useState("completed");
    const [debtDate, setDebtDate] = useState("");
    const [manualDiscountInput, setManualDiscountInput] = useState("");
    const productsQuery = useQuery({
        queryKey: ["products-search", search],
        queryFn: async () => {
            if (!navigator.onLine) {
                const cached = await getCachedProducts();
                return cached.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()) || item.barcode.includes(search));
            }
            const response = await api.get("/products", {
                params: { search: search || undefined, q: search || undefined },
            });
            await cacheProducts(response.data);
            return response.data;
        },
    });
    const stockQuery = useQuery({
        queryKey: ["stock-balance"],
        queryFn: async () => (await api.get("/stock")).data,
    });
    const customerLookupQuery = useQuery({
        queryKey: ["customer-by-phone", customerPhone],
        enabled: customerPhone.replace(/\D/g, "").length >= 10,
        queryFn: async () => {
            const response = await api.get(`/customers/phone/${customerPhone}`);
            return response.data;
        },
        retry: false,
    });
    useEffect(() => {
        if (customerLookupQuery.data) {
            setCustomer(customerLookupQuery.data);
        }
        else if (customerLookupQuery.isError) {
            setCustomer(null);
        }
    }, [customerLookupQuery.data, customerLookupQuery.isError]);
    // Prefetch full product catalog into IDB on mount (online only) so offline search
    // can find any product, not just terms previously searched online.
    useEffect(() => {
        if (!navigator.onLine)
            return;
        void (async () => {
            try {
                const response = await api.get("/products");
                await cacheProducts(response.data, { replace: true });
            }
            catch {
                // Network failed mid-load — search-time cacheProducts will eventually fill the store.
            }
        })();
    }, []);
    useEffect(() => {
        if (!showCreateCustomer)
            return;
        const id = requestAnimationFrame(() => {
            newCustomerNameRef.current?.focus();
        });
        return () => cancelAnimationFrame(id);
    }, [showCreateCustomer]);
    const createCustomerMutation = useMutation({
        mutationFn: async () => {
            const response = await api.post("/customers", {
                name: newCustomerName,
                phone: newCustomerPhone,
                discount_percent: Number(newCustomerDiscount || 0),
            });
            return response.data;
        },
        onSuccess: (newCustomer) => {
            setCustomer(newCustomer);
            setCustomerPhone(newCustomer.phone);
            setShowCreateCustomer(false);
        },
        onError: () => setMessage("Не удалось создать клиента"),
    });
    const playBeep = () => {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx)
                return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = 1200;
            gain.gain.value = 0.08;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.08);
            osc.onended = () => {
                void ctx.close();
            };
        }
        catch {
            // Ignore if browser blocks audio.
        }
    };
    const addProductToCart = (product, fromScanner = false, weightGrams) => {
        // Весовой товар без переданного веса (= ручной выбор из поиска):
        // не показываем браузерный prompt — заполняем поле PLU + фокус на «Вес».
        if (weightGrams === undefined && product.kind === "weighed") {
            if (hasFastCheckout && hasWeightScale && product.weighing_code) {
                setPluCode(product.weighing_code);
                setPluWeight("");
                setSearch("");
                queueMicrotask(() => pluWeightRef.current?.focus());
                return;
            }
            // Запасной путь: PLU не задан или PLU-блок выключен → старый prompt.
            const w = window.prompt(`${product.name}\nВведите вес в кг (например 1.2):`);
            if (w === null)
                return;
            const kg = parseFloat(w.replace(",", "."));
            if (!Number.isFinite(kg) || kg <= 0) {
                setMessage("Некорректный вес");
                return;
            }
            weightGrams = Math.round(kg * 1000);
        }
        // Весовой товар со сканера (вес из ШК) — заполняем поля для прозрачности.
        if (weightGrams !== undefined && weightGrams > 0 && fromScanner &&
            product.kind === "weighed" && hasFastCheckout && hasWeightScale) {
            if (product.weighing_code)
                setPluCode(product.weighing_code);
            setPluWeight((weightGrams / 1000).toString());
        }
        setCart((prev) => {
            if (weightGrams && weightGrams > 0) {
                // Весовой товар: каждое сканирование — отдельная строка (разный вес).
                return [
                    ...prev,
                    {
                        productId: product.id,
                        name: product.name,
                        barcode: product.barcode,
                        price: Number(product.sale_price), // цена за 1 кг
                        quantity: 1,
                        warrantyMonths: Number(product.warranty_months ?? 0),
                        weightGrams,
                        unit: product.unit ?? "kg",
                    },
                ];
            }
            const existing = prev.find((item) => item.productId === product.id && !item.weightGrams);
            if (existing) {
                return prev.map((item) => item.productId === product.id && !item.weightGrams
                    ? { ...item, quantity: item.quantity + 1 }
                    : item);
            }
            return [
                ...prev,
                {
                    productId: product.id,
                    name: product.name,
                    barcode: product.barcode,
                    price: Number(product.sale_price),
                    quantity: 1,
                    warrantyMonths: Number(product.warranty_months ?? 0),
                },
            ];
        });
        setSearch("");
        queueMicrotask(() => searchRef.current?.focus());
        if (fromScanner) {
            playBeep();
            setRecentAddedProductId(product.id);
            window.setTimeout(() => setRecentAddedProductId(null), 700);
        }
    };
    const onAddByCode = async (code) => {
        const normalized = code.trim().replace(/\s+/g, "");
        try {
            let product;
            let weightGrams;
            if (!navigator.onLine) {
                const cached = await getCachedProducts();
                const found = cached.find((item) => item.barcode === normalized);
                if (!found)
                    throw new Error("not found");
                product = found;
            }
            else {
                const response = await api.get(`/products/barcode/${encodeURIComponent(normalized)}`);
                const data = response.data;
                product = data;
                weightGrams = data.weight_grams ?? undefined;
            }
            addProductToCart(product, true, weightGrams);
            return true;
        }
        catch {
            setMessage("Товар по штрихкоду не найден в каталоге");
            return false;
        }
    };
    const stockMap = useMemo(() => new Map((stockQuery.data ?? []).map((row) => [row.product_id, row.balance])), [stockQuery.data]);
    const searchResults = useMemo(() => (search.length >= 2 ? (productsQuery.data ?? []).slice(0, 8) : []), [productsQuery.data, search.length]);
    const lineTotal = (item) => item.weightGrams ? (item.price * item.weightGrams) / 1000 : item.price * item.quantity;
    const subtotal = useMemo(() => cart.reduce((acc, item) => acc + lineTotal(item), 0), [cart]);
    const discountPercent = Number(customer?.discount_percent ?? 0);
    const discountAmount = subtotal * (discountPercent / 100);
    const manualDiscount = Math.max(0, Math.min(Number(manualDiscountInput) || 0, Math.max(0, subtotal - discountAmount)));
    const deliveryPrice = needDelivery && deliveryType === "separate" ? Number(deliveryPriceInput || 0) : 0;
    const installationPrice = needInstallation ? Number(installationPriceInput || 0) : 0;
    const total = Math.max(0, subtotal - discountAmount - manualDiscount + deliveryPrice + installationPrice);
    const receivedNum = Math.max(0, Number(receivedInput) || 0);
    const partialPaid = Math.min(receivedNum, total);
    /** Для completed: если пользователь ничего не ввёл — заполняем total автоматически
     *  (старое поведение). Если ввёл — используем введённое (clamped в [0, total]).
     *  Для debt — всегда берём то что ввели (может быть < total — остаток в долг). */
    const completedPaid = receivedNum > 0 ? partialPaid : total;
    const paidCash = splitPayment
        ? Number(paidCashInput || 0)
        : paymentMode === "cash"
            ? saleType === "completed" ? completedPaid : partialPaid
            : 0;
    const paidCard = splitPayment
        ? Number(paidCardInput || 0)
        : paymentMode === "card"
            ? saleType === "completed" ? completedPaid : partialPaid
            : 0;
    const paidTransfer = splitPayment
        ? Number(paidTransferInput || 0)
        : paymentMode === "transfer"
            ? saleType === "completed" ? completedPaid : partialPaid
            : 0;
    const paidTotal = paidCash + paidCard + paidTransfer;
    /** Для completed нужна полная оплата; для debt — допустима частичная (остаток уйдёт в долг). */
    const paymentValid = saleType === "completed"
        ? Math.round(paidTotal * 100) === Math.round(total * 100)
        : Math.round(paidTotal * 100) <= Math.round(total * 100);
    const remainingDebt = Math.max(0, total - paidTotal);
    const receivedCash = Number(receivedInput || 0);
    const change = paymentMode === "cash" && !splitPayment ? Math.max(0, receivedCash - total) : 0;
    const checkoutMutation = useMutation({
        mutationFn: async () => {
            const payload = {
                customer_id: customer?.id ?? null,
                total,
                items: cart.map((item) => ({
                    product_id: item.productId,
                    quantity: item.quantity,
                    price: item.price,
                    discount: discountPercent,
                    weight_grams: item.weightGrams ?? null,
                })),
                paid_cash: paidCash,
                paid_card: paidCard,
                paid_transfer: paidTransfer,
                delivery_type: needDelivery ? deliveryType : "none",
                delivery_price: deliveryPrice,
                delivery_address: needDelivery ? deliveryAddress : "",
                delivery_date: needDelivery && deliveryDate ? deliveryDate : null,
                installation: needInstallation,
                installation_price: installationPrice,
                status: saleType,
                offline_id: crypto.randomUUID(),
            };
            if (saleType === "debt") {
                payload.promised_payment_date = debtDate || null;
            }
            if (!navigator.onLine) {
                await queueOfflineSale(payload);
                return null;
            }
            const response = await api.post("/sales", payload);
            return response.data;
        },
        onSuccess: (data) => {
            setSuccessOverlay({
                total,
                customerName: customer?.name ?? null,
                saleId: data?.id ?? null,
            });
            setTimeout(() => {
                setSuccessOverlay(null);
            }, 3000);
            resetSale();
            setShowCheckoutMobile(false);
            setMessage("");
        },
        onError: (error) => {
            let detail = "Ошибка при оформлении продажи";
            let status;
            if (axios.isAxiosError(error)) {
                status = error.response?.status;
                const d = error.response?.data?.detail;
                detail =
                    typeof d === "string"
                        ? d
                        : Array.isArray(d)
                            ? d.map((x) => (typeof x === "object" && x && "msg" in x ? String(x.msg) : JSON.stringify(x))).join("; ")
                            : error.message;
            }
            setMessage(detail);
            // 400 «откройте смену» — поднимем экран наверх, чтобы кассир увидел виджет смены.
            if (status === 400 && /смен/i.test(detail)) {
                try {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                }
                catch { /* SSR-safe */ }
                // Лёгкий alert, чтобы юзер точно заметил.
                setTimeout(() => alert("⛔ " + detail), 50);
            }
        },
    });
    const needsCustomer = saleType === "debt";
    const canCheckout = cart.length > 0 &&
        paymentValid &&
        !checkoutMutation.isPending &&
        (!needsCustomer || customer !== null);
    const printReceipt = (saleId) => {
        if (!saleId)
            return;
        // Open the window synchronously inside the click handler, otherwise iOS Safari blocks it.
        const win = window.open("", "_blank");
        void (async () => {
            try {
                const response = await api.get(`/sales/${saleId}/receipt`, { responseType: "blob" });
                const url = URL.createObjectURL(response.data);
                if (win) {
                    win.location.href = url;
                }
                else {
                    // Popup blocked — fall back to direct download.
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `receipt_${saleId}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                }
            }
            catch {
                if (win)
                    win.close();
                setMessage("Не удалось получить чек");
            }
        })();
    };
    const resetSale = () => {
        setCart([]);
        setCustomer(null);
        setCustomerPhone("");
        setSearch("");
        setNeedDelivery(false);
        setDeliveryAddress("");
        setDeliveryDate("");
        setDeliveryPriceInput("");
        setDeliveryType("separate");
        setNeedInstallation(false);
        setInstallationPriceInput("");
        setPaymentMode("cash");
        setSplitPayment(false);
        setPaidCashInput("");
        setPaidCardInput("");
        setPaidTransferInput("");
        setReceivedInput("");
        setSaleType("completed");
        setDebtDate("");
        setManualDiscountInput("");
    };
    return (_jsxs("main", { className: `mx-auto min-h-screen max-w-7xl bg-slate-50 px-3 py-3 ${hasFastCheckout && hasWeightScale ? "fast-checkout" : ""}`, children: [_jsx("h1", { className: "mb-3 text-3xl font-semibold", children: "\u041A\u0430\u0441\u0441\u0430" }), _jsx(ShiftWidget, {}), _jsxs("div", { className: "grid gap-4 md:grid-cols-5", children: [_jsxs("section", { className: "rounded-2xl bg-white p-3 shadow md:col-span-3", children: [hasFastCheckout && hasWeightScale ? (_jsxs("div", { className: "mb-3 flex flex-wrap gap-2", children: [_jsx("input", { inputMode: "numeric", pattern: "\\d+", className: "h-12 w-32 rounded-xl border px-3 text-base font-mono", placeholder: "PLU", value: pluCode, onChange: (e) => setPluCode(e.target.value), onKeyDown: (e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                pluWeightRef.current?.focus();
                                            }
                                        } }), _jsx("input", { ref: pluWeightRef, inputMode: "decimal", className: "h-12 w-32 rounded-xl border px-3 text-base font-mono", placeholder: "\u0412\u0435\u0441, \u043A\u0433", value: pluWeight, onChange: (e) => setPluWeight(e.target.value), onKeyDown: async (e) => {
                                            if (e.key !== "Enter")
                                                return;
                                            e.preventDefault();
                                            const code = pluCode.trim();
                                            const kg = parseFloat(pluWeight.replace(",", "."));
                                            if (!code) {
                                                setMessage("Введите PLU");
                                                return;
                                            }
                                            if (!Number.isFinite(kg) || kg <= 0) {
                                                setMessage("Введите вес в кг");
                                                return;
                                            }
                                            try {
                                                const response = await api.get(`/products/plu/${encodeURIComponent(code)}`);
                                                const product = response.data;
                                                addProductToCart(product, true, Math.round(kg * 1000));
                                                setPluCode("");
                                                setPluWeight("");
                                                queueMicrotask(() => {
                                                    const pluInput = document.querySelector('input[placeholder="PLU"]');
                                                    pluInput?.focus();
                                                });
                                            }
                                            catch (err) {
                                                const detail = err?.response?.data?.detail;
                                                setMessage(detail || `Товар с PLU ${code} не найден`);
                                            }
                                        } }), _jsx("span", { className: "self-center text-sm text-slate-500", children: "PLU \u2192 Enter \u2192 \u0432\u0435\u0441 \u0432 \u043A\u0433 \u2192 Enter" })] })) : null, _jsxs("div", { className: "relative mb-3 flex gap-2", children: [_jsx("input", { ref: searchRef, value: search, autoFocus: true, onChange: (e) => setSearch(e.target.value), onKeyDown: (e) => {
                                            if (e.key === "Enter" && search.trim()) {
                                                const exact = searchResults.find((item) => item.barcode === search.trim());
                                                if (exact)
                                                    addProductToCart(exact);
                                                else
                                                    void onAddByCode(search.trim());
                                            }
                                        }, className: "h-12 flex-1 rounded-xl border px-4 text-base", placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435, \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434 \u0438\u043B\u0438 \u0435\u0433\u043E \u0447\u0430\u0441\u0442\u044C (\u0435\u0441\u043B\u0438 \u0441\u0442\u0451\u0440\u0442)" }), _jsx("button", { className: "flex h-12 min-w-[44px] items-center justify-center rounded-xl bg-primary px-4 text-white", onClick: () => {
                                            setScannerSession((s) => s + 1);
                                            setShowScanner(true);
                                        }, "aria-label": "\u0421\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434", children: _jsxs("svg", { viewBox: "0 0 24 24", width: "22", height: "22", fill: "currentColor", "aria-hidden": "true", children: [_jsx("rect", { x: "3", y: "5", width: "2", height: "14" }), _jsx("rect", { x: "6", y: "5", width: "1", height: "14" }), _jsx("rect", { x: "8", y: "5", width: "3", height: "14" }), _jsx("rect", { x: "12", y: "5", width: "1", height: "14" }), _jsx("rect", { x: "14", y: "5", width: "2", height: "14" }), _jsx("rect", { x: "17", y: "5", width: "1", height: "14" }), _jsx("rect", { x: "19", y: "5", width: "2", height: "14" })] }) }), search.length >= 2 && searchResults.length > 0 ? (_jsx("div", { className: "absolute left-0 right-0 top-14 z-20 max-h-72 overflow-auto rounded-xl border bg-white shadow", children: searchResults.map((item) => (_jsxs("button", { className: "flex w-full items-center justify-between border-b p-3 text-left last:border-b-0", onClick: () => addProductToCart(item), children: [_jsxs("div", { children: [_jsx("p", { className: "font-medium", children: item.name }), _jsxs("p", { className: "text-xs text-slate-500", children: ["\u041E\u0441\u0442\u0430\u0442\u043E\u043A: ", stockMap.get(item.id) ?? 0] })] }), _jsx("p", { className: "font-semibold text-primary", children: Number(item.sale_price).toFixed(2) })] }, item.id))) })) : null] }), _jsx("div", { className: "space-y-2", children: cart.length ? (cart.map((item, idx) => (_jsxs("div", { className: `rounded-xl border p-3 transition-colors ${recentAddedProductId === item.productId ? "border-emerald-400 bg-emerald-50" : ""}`, children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("p", { className: "font-medium", children: item.name }), item.warrantyMonths > 0 ? (_jsxs("span", { className: "mt-1 inline-block rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700", children: ["\u0413\u0430\u0440\u0430\u043D\u0442\u0438\u044F ", item.warrantyMonths, " \u043C\u0435\u0441"] })) : null] }), _jsx("button", { className: "h-11 min-w-[44px] rounded-lg border px-3 text-red-600", onClick: () => setCart((prev) => prev.filter((_, i) => i !== idx)), children: "\u00D7" })] }), _jsxs("div", { className: "mt-2 flex items-center justify-between", children: [item.weightGrams ? (_jsxs("span", { className: "text-sm text-slate-600", children: [(item.weightGrams / 1000).toFixed(3), " \u043A\u0433"] })) : (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { className: "h-11 min-w-[44px] rounded-lg border", onClick: () => setCart((prev) => prev
                                                                .map((i, k) => k === idx ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i)
                                                                .filter((i) => i.quantity > 0)), children: "\u2212" }), _jsx("span", { className: "min-w-8 text-center text-lg font-semibold", children: item.quantity }), _jsx("button", { className: "h-11 min-w-[44px] rounded-lg border", onClick: () => setCart((prev) => prev.map((i, k) => (k === idx ? { ...i, quantity: i.quantity + 1 } : i))), children: "+" })] })), _jsxs("div", { className: "text-right", children: [_jsx("p", { className: "text-xs text-slate-500", children: item.weightGrams
                                                                ? `${item.price.toFixed(2)} / кг`
                                                                : `${item.price.toFixed(2)} / шт` }), _jsxs("p", { className: "font-semibold", children: [lineTotal(item).toFixed(2), " \u0441\u043E\u043C"] })] })] })] }, idx)))) : (_jsx("div", { className: "rounded-xl border border-dashed p-8 text-center text-slate-500", children: "\u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0442\u043E\u0432\u0430\u0440\u044B \u0432 \u0447\u0435\u043A" })) }), _jsxs("div", { className: "mt-4 rounded-xl bg-slate-100 p-4", children: [_jsxs("div", { className: "flex justify-between text-sm", children: [_jsx("span", { children: "\u041F\u043E\u0434\u044B\u0442\u043E\u0433" }), _jsxs("span", { children: [subtotal.toFixed(2), " \u0441\u043E\u043C"] })] }), discountAmount > 0 ? (_jsxs("div", { className: "mt-1 flex justify-between text-sm", children: [_jsxs("span", { children: ["\u0421\u043A\u0438\u0434\u043A\u0430 \u043A\u043B\u0438\u0435\u043D\u0442\u0430 (", discountPercent.toFixed(0), "%)"] }), _jsxs("span", { children: ["-", discountAmount.toFixed(2), " \u0441\u043E\u043C"] })] })) : null, _jsxs("div", { className: "mt-2 flex items-center justify-between gap-2 text-sm", children: [_jsx("span", { children: "\u0421\u043A\u0438\u0434\u043A\u0430 \u0432\u0440\u0443\u0447\u043D\u0443\u044E" }), _jsx(NumberInput, { value: manualDiscountInput, onChange: setManualDiscountInput, placeholder: "0", className: "h-9 w-24 rounded-lg border px-2 text-right" })] }), manualDiscount > 0 ? (_jsxs("div", { className: "mt-1 flex justify-between text-sm text-amber-700", children: [_jsx("span", { children: "\u0412 \u0442.\u0447. \u0440\u0443\u0447\u043D\u0430\u044F \u0441\u043A\u0438\u0434\u043A\u0430" }), _jsxs("span", { children: ["-", manualDiscount.toFixed(2), " \u0441\u043E\u043C"] })] })) : null, _jsxs("div", { className: "mt-2 flex justify-between text-[32px] font-bold leading-none", children: [_jsx("span", { children: "\u0418\u0422\u041E\u0413\u041E" }), _jsx("span", { children: total.toFixed(2) })] })] }), _jsx("button", { className: "mt-3 h-14 w-full rounded-xl bg-success text-xl font-semibold text-white md:hidden", onClick: () => setShowCheckoutMobile(true), children: "\u041E\u0444\u043E\u0440\u043C\u0438\u0442\u044C" })] }), _jsxs("section", { className: `rounded-2xl bg-white p-3 shadow md:col-span-2 ${showCheckoutMobile ? "fixed inset-x-0 bottom-16 z-40 max-h-[80dvh] overflow-auto rounded-t-2xl pb-4" : "hidden md:block"}`, children: [_jsxs("div", { className: "mb-3 flex items-center justify-between md:hidden", children: [_jsx("h3", { className: "text-lg font-semibold", children: "\u041E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u0435" }), _jsx("button", { className: "text-slate-500", onClick: () => setShowCheckoutMobile(false), children: "\u2715" })] }), _jsx(SectionTitle, { title: "\u041A\u043B\u0438\u0435\u043D\u0442" }), _jsx("input", { value: customerPhone, onChange: (e) => setCustomerPhone(e.target.value), className: "h-11 w-full rounded-xl border px-3", placeholder: "\u041F\u043E\u0438\u0441\u043A \u043F\u043E \u043D\u043E\u043C\u0435\u0440\u0443 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0430" }), customer ? (_jsxs("div", { className: "mt-2 rounded-xl border p-3", children: [_jsx("p", { className: "font-medium", children: customer.name }), _jsxs("span", { className: "mt-1 inline-block rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700", children: ["\u0421\u043A\u0438\u0434\u043A\u0430 ", Number(customer.discount_percent ?? 0).toFixed(0), "%"] })] })) : (_jsxs("div", { className: "mt-2 flex gap-2", children: [_jsx("button", { className: "h-11 flex-1 rounded-xl border", onClick: () => setShowCreateCustomer(true), children: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043A\u043B\u0438\u0435\u043D\u0442\u0430" }), _jsx("button", { className: "h-11 flex-1 rounded-xl border", onClick: () => {
                                            setCustomer(null);
                                            setCustomerPhone("");
                                        }, children: "\u0411\u0435\u0437 \u043A\u043B\u0438\u0435\u043D\u0442\u0430" })] })), _jsx(SectionTitle, { title: "\u041E\u043F\u043B\u0430\u0442\u0430", className: "mt-4" }), _jsxs("div", { className: "grid grid-cols-3 gap-2", children: [_jsx(PayModeButton, { label: "\uD83D\uDCB5 \u041D\u0430\u043B\u0438\u0447\u043D\u044B\u0435", active: paymentMode === "cash", onClick: () => setPaymentMode("cash") }), _jsx(PayModeButton, { label: "\uD83D\uDCB3 \u041A\u0430\u0440\u0442\u0430", active: paymentMode === "card", onClick: () => setPaymentMode("card") }), _jsx(PayModeButton, { label: "\uD83D\uDCF1 \u041F\u0435\u0440\u0435\u0432\u043E\u0434", active: paymentMode === "transfer", onClick: () => setPaymentMode("transfer") })] }), _jsx("button", { className: "mt-2 text-sm text-primary", onClick: () => setSplitPayment((prev) => !prev), children: splitPayment ? "Скрыть разделение" : "Разделить оплату" }), splitPayment ? (_jsxs("div", { className: "mt-2 space-y-2", children: [_jsx(NumberInput, { className: `h-11 w-full rounded-xl border px-3 ${!paymentValid ? "border-red-400" : ""}`, placeholder: "\u041D\u0430\u043B\u0438\u0447\u043D\u044B\u043C\u0438: ___ \u0441\u043E\u043C", value: paidCashInput, onChange: setPaidCashInput }), _jsx(NumberInput, { className: `h-11 w-full rounded-xl border px-3 ${!paymentValid ? "border-red-400" : ""}`, placeholder: "\u041A\u0430\u0440\u0442\u043E\u0439: ___ \u0441\u043E\u043C", value: paidCardInput, onChange: setPaidCardInput }), _jsx(NumberInput, { className: `h-11 w-full rounded-xl border px-3 ${!paymentValid ? "border-red-400" : ""}`, placeholder: "\u041F\u0435\u0440\u0435\u0432\u043E\u0434\u043E\u043C: ___ \u0441\u043E\u043C", value: paidTransferInput, onChange: setPaidTransferInput })] })) : null, !splitPayment ? (_jsxs("div", { className: "mt-2", children: [_jsx(NumberInput, { className: "h-11 w-full rounded-xl border px-3", placeholder: `Получено ${paymentMode === "cash" ? "наличными" : paymentMode === "card" ? "картой" : "переводом"}: ___ сом`, value: receivedInput, onChange: setReceivedInput }), paymentMode === "cash" && saleType === "completed" ? (_jsxs("p", { className: "mt-2 text-2xl font-bold text-emerald-600", children: ["\u0421\u0434\u0430\u0447\u0430: ", change.toFixed(2), " \u0441\u043E\u043C"] })) : null, saleType === "completed" && receivedInput === "" ? (_jsxs("p", { className: "mt-1 text-xs text-slate-500", children: ["\u0415\u0441\u043B\u0438 \u043F\u043E\u043B\u0435 \u043F\u0443\u0441\u0442\u043E\u0435 \u2014 \u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044F \u043F\u043E\u043B\u043D\u0430\u044F \u0441\u0443\u043C\u043C\u0430 ", total.toFixed(2), " \u0441\u043E\u043C"] })) : null] })) : null, hasDelivery ? (_jsxs(_Fragment, { children: [_jsx(SectionTitle, { title: "\u0414\u043E\u0441\u0442\u0430\u0432\u043A\u0430 \u0438 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430", className: "mt-4" }), _jsxs("label", { className: "flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", checked: needDelivery, onChange: (e) => setNeedDelivery(e.target.checked) }), "\u041D\u0443\u0436\u043D\u0430 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0430"] }), needDelivery ? (_jsxs("div", { className: "mt-2 space-y-2", children: [_jsx("input", { className: "h-11 w-full rounded-xl border px-3", placeholder: "\u0410\u0434\u0440\u0435\u0441 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438", value: deliveryAddress, onChange: (e) => setDeliveryAddress(e.target.value) }), _jsx("input", { type: "date", className: "h-11 w-full rounded-xl border px-3", value: deliveryDate, onChange: (e) => setDeliveryDate(e.target.value) }), _jsx(NumberInput, { className: "h-11 w-full rounded-xl border px-3", placeholder: "\u0426\u0435\u043D\u0430 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438", value: deliveryPriceInput, onChange: setDeliveryPriceInput }), _jsxs("select", { className: "h-11 w-full rounded-xl border px-3", value: deliveryType, onChange: (e) => setDeliveryType(e.target.value), children: [_jsx("option", { value: "included", children: "\u0412\u043A\u043B\u044E\u0447\u0435\u043D\u0430 \u0432 \u0446\u0435\u043D\u0443" }), _jsx("option", { value: "separate", children: "\u041E\u0442\u0434\u0435\u043B\u044C\u043D\u043E" })] })] })) : null, _jsxs("label", { className: "mt-2 flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", checked: needInstallation, onChange: (e) => setNeedInstallation(e.target.checked) }), "\u041D\u0443\u0436\u043D\u0430 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430"] }), needInstallation ? (_jsx(NumberInput, { className: "mt-2 h-11 w-full rounded-xl border px-3", placeholder: "\u0426\u0435\u043D\u0430 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438", value: installationPriceInput, onChange: setInstallationPriceInput })) : null] })) : null, _jsx(SectionTitle, { title: "\u0422\u0438\u043F \u043F\u0440\u043E\u0434\u0430\u0436\u0438", className: "mt-4" }), _jsxs("div", { className: "space-y-2 text-sm", children: [_jsxs("label", { className: "flex items-center gap-2", children: [_jsx("input", { type: "radio", name: "saleType", checked: saleType === "completed", onChange: () => setSaleType("completed") }), "\u2705 \u041E\u0431\u044B\u0447\u043D\u0430\u044F \u043F\u0440\u043E\u0434\u0430\u0436\u0430"] }), _jsxs("label", { className: "flex items-center gap-2", children: [_jsx("input", { type: "radio", name: "saleType", checked: saleType === "debt", onChange: () => setSaleType("debt") }), "\uD83D\uDCCB \u0414\u043E\u043B\u0433"] })] }), saleType === "debt" ? (_jsx("input", { type: "date", className: "mt-2 h-11 w-full rounded-xl border px-3", value: debtDate, onChange: (e) => setDebtDate(e.target.value) })) : null, needsCustomer && !customer ? _jsx("p", { className: "mt-2 text-sm text-amber-700", children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043A\u043B\u0438\u0435\u043D\u0442\u0430 \u0434\u043B\u044F \u0434\u043E\u043B\u0433\u0430" }) : null, !paymentValid ? (_jsx("p", { className: "mt-2 text-sm text-red-600", children: saleType === "completed"
                                    ? "Сумма оплаты должна совпадать с итогом"
                                    : "Сумма оплаты не может превышать итог" })) : null, paymentValid && saleType === "debt" && remainingDebt > 0 ? (_jsxs("p", { className: "mt-2 text-sm font-semibold text-amber-700", children: ["\u0412 \u0434\u043E\u043B\u0433: ", remainingDebt.toFixed(2), " \u0441\u043E\u043C"] })) : null, message ? _jsx("p", { className: "mt-2 text-sm text-amber-700", children: message }) : null, _jsx("button", { type: "button", disabled: !canCheckout, onClick: () => checkoutMutation.mutate(), className: "mt-4 h-14 w-full rounded-xl bg-success text-xl font-semibold text-white disabled:opacity-50", children: "\u041E\u0444\u043E\u0440\u043C\u0438\u0442\u044C \u043F\u0440\u043E\u0434\u0430\u0436\u0443" })] })] }), showCreateCustomer ? (_jsx("div", { className: "fixed inset-0 z-40 bg-black/40 p-4", children: _jsxs("div", { className: "mx-auto max-w-md rounded-2xl bg-white p-4", children: [_jsx("h3", { className: "text-xl font-semibold", children: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043A\u043B\u0438\u0435\u043D\u0442\u0430" }), _jsxs("div", { className: "mt-3 space-y-2", children: [_jsx("input", { ref: newCustomerNameRef, className: "h-11 w-full rounded-xl border px-3", placeholder: "\u0418\u043C\u044F", value: newCustomerName, onChange: (e) => setNewCustomerName(e.target.value) }), _jsx("input", { className: "h-11 w-full rounded-xl border px-3", placeholder: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D", value: newCustomerPhone, onChange: (e) => setNewCustomerPhone(e.target.value) }), _jsx(NumberInput, { className: "h-11 w-full rounded-xl border px-3", placeholder: "\u0421\u043A\u0438\u0434\u043A\u0430 %", value: newCustomerDiscount, onChange: setNewCustomerDiscount })] }), _jsxs("div", { className: "mt-3 flex gap-2", children: [_jsx("button", { className: "h-11 flex-1 rounded-xl bg-primary text-white", onClick: () => createCustomerMutation.mutate(), children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C" }), _jsx("button", { className: "h-11 flex-1 rounded-xl border", onClick: () => setShowCreateCustomer(false), children: "\u041E\u0442\u043C\u0435\u043D\u0430" })] })] }) })) : null, showScanner ? (_jsx(BarcodeScanner, { onDetected: (code) => {
                    return (async () => {
                        const clean = code.trim().replace(/\s+/g, "");
                        const ok = await onAddByCode(code);
                        return {
                            ok,
                            message: ok ? `✓ В корзину: ${clean}` : `✗ Нет в каталоге: ${clean}`,
                            autoClose: ok,
                        };
                    })();
                }, onClose: () => setShowScanner(false) }, scannerSession)) : null, successOverlay ? (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-emerald-600/95 p-4 text-white", children: _jsxs("div", { className: "w-full max-w-lg rounded-2xl bg-emerald-700 p-6 text-center", children: [_jsx("div", { className: "text-6xl", children: "\u2713" }), _jsx("h2", { className: "mt-2 text-3xl font-bold", children: "\u041F\u0440\u043E\u0434\u0430\u0436\u0430 \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0430!" }), _jsxs("p", { className: "mt-2 text-4xl font-bold", children: [successOverlay.total.toFixed(2), " \u0441\u043E\u043C"] }), successOverlay.customerName ? _jsx("p", { className: "mt-1 text-lg", children: successOverlay.customerName }) : null, _jsx("div", { className: "mt-5", children: _jsx("button", { className: "h-11 w-full rounded-xl bg-white/20 disabled:opacity-50", disabled: !successOverlay.saleId, onClick: () => printReceipt(successOverlay.saleId), children: "\u041D\u0430\u043F\u0435\u0447\u0430\u0442\u0430\u0442\u044C \u0447\u0435\u043A" }) })] }) })) : null] }));
}
function SectionTitle({ title, className = "" }) {
    return _jsx("h3", { className: `mb-2 text-sm font-semibold uppercase text-slate-500 ${className}`, children: title });
}
function PayModeButton({ label, active, onClick }) {
    return (_jsx("button", { onClick: onClick, className: `h-11 rounded-xl border text-sm ${active ? "border-primary bg-indigo-50 text-primary" : "bg-white"}`, children: label }));
}
