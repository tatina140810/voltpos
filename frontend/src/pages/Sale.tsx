import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";

import { BarcodeScanner } from "../components/BarcodeScanner";
import { NumberInput } from "../components/NumberInput";
import { ShiftWidget } from "../components/ShiftWidget";
import { useBusinessSettings } from "../hooks/useBusinessSettings";
import { api } from "../lib/api";
import { cacheProducts, getCachedProducts, queueOfflineSale } from "../lib/offline";

type Product = {
  id: number;
  name: string;
  barcode: string;
  sale_price: number;
  warranty_months?: number;
  min_stock?: number;
  kind?: "piece" | "weighed";
  weighing_code?: string | null;
  unit?: string | null;
};

type ProductWithWeight = Product & { weight_grams?: number | null };

type StockRow = {
  product_id: number;
  balance: number;
};

type CartItem = {
  productId: number;
  name: string;
  barcode: string;
  price: number;
  quantity: number;
  warrantyMonths: number;
  weightGrams?: number; // только для весовых; price тогда = цена за 1 кг
  unit?: string;        // отображение: "кг", "г", "л"
};

type Customer = {
  id: number;
  name: string;
  phone: string;
  discount_percent?: number;
};

type SaleType = "completed" | "debt";
type DeliveryType = "none" | "included" | "separate";

export function SalePage() {
  const { hasDelivery, hasFastCheckout, hasWeightScale } = useBusinessSettings();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const pluWeightRef = useRef<HTMLInputElement | null>(null);
  const [pluCode, setPluCode] = useState("");
  const [pluWeight, setPluWeight] = useState("");
  const newCustomerNameRef = useRef<HTMLInputElement | null>(null);

  const [search, setSearch] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  // Сессия сканера: меняется при каждом открытии, чтобы React гарантированно
  // пересоздал компонент и MediaStream (фикс для iOS, который не отдаёт камеру быстро).
  const [scannerSession, setScannerSession] = useState(0);
  const [showCheckoutMobile, setShowCheckoutMobile] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [message, setMessage] = useState("");
  const [recentAddedProductId, setRecentAddedProductId] = useState<number | null>(null);
  const [successOverlay, setSuccessOverlay] = useState<{
    total: number;
    customerName: string | null;
    saleId: number | null;
  } | null>(null);

  const [customerPhone, setCustomerPhone] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerDiscount, setNewCustomerDiscount] = useState("");

  const [paymentMode, setPaymentMode] = useState<"cash" | "card" | "transfer">("cash");
  const [splitPayment, setSplitPayment] = useState(false);
  const [paidCashInput, setPaidCashInput] = useState("");
  const [paidCardInput, setPaidCardInput] = useState("");
  const [paidTransferInput, setPaidTransferInput] = useState("");
  const [receivedInput, setReceivedInput] = useState("");

  const [needDelivery, setNeedDelivery] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryPriceInput, setDeliveryPriceInput] = useState("");
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("separate");

  const [needInstallation, setNeedInstallation] = useState(false);
  const [installationPriceInput, setInstallationPriceInput] = useState("");

  const [saleType, setSaleType] = useState<SaleType>("completed");
  const [debtDate, setDebtDate] = useState("");
  const [manualDiscountInput, setManualDiscountInput] = useState("");

  const productsQuery = useQuery({
    queryKey: ["products-search", search],
    queryFn: async () => {
      if (!navigator.onLine) {
        const cached = await getCachedProducts();
        return cached.filter((item) =>
          item.name.toLowerCase().includes(search.toLowerCase()) || item.barcode.includes(search),
        ) as Product[];
      }
      const response = await api.get("/products", {
        params: { search: search || undefined, q: search || undefined },
      });
      await cacheProducts(response.data as Product[]);
      return response.data as Product[];
    },
  });

  const stockQuery = useQuery({
    queryKey: ["stock-balance"],
    queryFn: async () => (await api.get("/stock")).data as StockRow[],
  });

  const customerLookupQuery = useQuery({
    queryKey: ["customer-by-phone", customerPhone],
    enabled: customerPhone.replace(/\D/g, "").length >= 10,
    queryFn: async () => {
      const response = await api.get(`/customers/phone/${customerPhone}`);
      return response.data as Customer;
    },
    retry: false,
  });

  useEffect(() => {
    if (customerLookupQuery.data) {
      setCustomer(customerLookupQuery.data);
    } else if (customerLookupQuery.isError) {
      setCustomer(null);
    }
  }, [customerLookupQuery.data, customerLookupQuery.isError]);

  // Prefetch full product catalog into IDB on mount (online only) so offline search
  // can find any product, not just terms previously searched online.
  useEffect(() => {
    if (!navigator.onLine) return;
    void (async () => {
      try {
        const response = await api.get("/products");
        await cacheProducts(response.data as Product[], { replace: true });
      } catch {
        // Network failed mid-load — search-time cacheProducts will eventually fill the store.
      }
    })();
  }, []);

  useEffect(() => {
    if (!showCreateCustomer) return;
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
      return response.data as Customer;
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
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
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
    } catch {
      // Ignore if browser blocks audio.
    }
  };

  const addProductToCart = (product: Product, fromScanner = false, weightGrams?: number) => {
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
      if (w === null) return;
      const kg = parseFloat(w.replace(",", "."));
      if (!Number.isFinite(kg) || kg <= 0) {
        setMessage("Некорректный вес");
        return;
      }
      weightGrams = Math.round(kg * 1000);
    }
    // Весовой товар со сканера (вес из ШК) — заполняем поля для прозрачности.
    if (
      weightGrams !== undefined && weightGrams > 0 && fromScanner &&
      product.kind === "weighed" && hasFastCheckout && hasWeightScale
    ) {
      if (product.weighing_code) setPluCode(product.weighing_code);
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
        return prev.map((item) =>
          item.productId === product.id && !item.weightGrams
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
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

  const onAddByCode = async (code: string) => {
    const normalized = code.trim().replace(/\s+/g, "");
    try {
      let product: Product;
      let weightGrams: number | undefined;
      if (!navigator.onLine) {
        const cached = await getCachedProducts();
        const found = cached.find((item) => item.barcode === normalized);
        if (!found) throw new Error("not found");
        product = found as Product;
      } else {
        const response = await api.get(`/products/barcode/${encodeURIComponent(normalized)}`);
        const data = response.data as ProductWithWeight;
        product = data;
        weightGrams = data.weight_grams ?? undefined;
      }
      addProductToCart(product, true, weightGrams);
      return true;
    } catch {
      setMessage("Товар по штрихкоду не найден в каталоге");
      return false;
    }
  };

  const stockMap = useMemo(
    () => new Map((stockQuery.data ?? []).map((row) => [row.product_id, row.balance])),
    [stockQuery.data],
  );

  const searchResults = useMemo(
    () => (search.length >= 2 ? (productsQuery.data ?? []).slice(0, 8) : []),
    [productsQuery.data, search.length],
  );

  const lineTotal = (item: CartItem): number =>
    item.weightGrams ? (item.price * item.weightGrams) / 1000 : item.price * item.quantity;

  const subtotal = useMemo(
    () => cart.reduce((acc, item) => acc + lineTotal(item), 0),
    [cart],
  );
  const discountPercent = Number(customer?.discount_percent ?? 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const manualDiscount = Math.max(
    0,
    Math.min(Number(manualDiscountInput) || 0, Math.max(0, subtotal - discountAmount)),
  );
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
  const paymentValid =
    saleType === "completed"
      ? Math.round(paidTotal * 100) === Math.round(total * 100)
      : Math.round(paidTotal * 100) <= Math.round(total * 100);
  const remainingDebt = Math.max(0, total - paidTotal);
  const receivedCash = Number(receivedInput || 0);
  const change = paymentMode === "cash" && !splitPayment ? Math.max(0, receivedCash - total) : 0;

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
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
      return response.data as { id: number };
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
      let status: number | undefined;
      if (axios.isAxiosError(error)) {
        status = error.response?.status;
        const d = error.response?.data?.detail;
        detail =
          typeof d === "string"
            ? d
            : Array.isArray(d)
              ? d.map((x: unknown) => (typeof x === "object" && x && "msg" in x ? String((x as { msg?: string }).msg) : JSON.stringify(x))).join("; ")
              : error.message;
      }
      setMessage(detail);
      // 400 «откройте смену» — поднимем экран наверх, чтобы кассир увидел виджет смены.
      if (status === 400 && /смен/i.test(detail)) {
        try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* SSR-safe */ }
        // Лёгкий alert, чтобы юзер точно заметил.
        setTimeout(() => alert("⛔ " + detail), 50);
      }
    },
  });

  const needsCustomer = saleType === "debt";
  const canCheckout =
    cart.length > 0 &&
    paymentValid &&
    !checkoutMutation.isPending &&
    (!needsCustomer || customer !== null);

  const printReceipt = (saleId: number | null) => {
    if (!saleId) return;
    // Open the window synchronously inside the click handler, otherwise iOS Safari blocks it.
    const win = window.open("", "_blank");
    void (async () => {
      try {
        const response = await api.get(`/sales/${saleId}/receipt`, { responseType: "blob" });
        const url = URL.createObjectURL(response.data as Blob);
        if (win) {
          win.location.href = url;
        } else {
          // Popup blocked — fall back to direct download.
          const a = document.createElement("a");
          a.href = url;
          a.download = `receipt_${saleId}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      } catch {
        if (win) win.close();
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

  return (
    <main className={`mx-auto min-h-screen max-w-7xl bg-slate-50 px-3 py-3 ${hasFastCheckout && hasWeightScale ? "fast-checkout" : ""}`}>
      <h1 className="mb-3 text-3xl font-semibold">Касса</h1>

      <ShiftWidget />

      <div className="grid gap-4 md:grid-cols-5">
        <section className="rounded-2xl bg-white p-3 shadow md:col-span-3">
          {hasFastCheckout && hasWeightScale ? (
            <div className="mb-3 flex flex-wrap gap-2">
              <input
                inputMode="numeric"
                pattern="\d+"
                className="h-12 w-32 rounded-xl border px-3 text-base font-mono"
                placeholder="PLU"
                value={pluCode}
                onChange={(e) => setPluCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    pluWeightRef.current?.focus();
                  }
                }}
              />
              <input
                ref={pluWeightRef}
                inputMode="decimal"
                className="h-12 w-32 rounded-xl border px-3 text-base font-mono"
                placeholder="Вес, кг"
                value={pluWeight}
                onChange={(e) => setPluWeight(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const code = pluCode.trim();
                  const kg = parseFloat(pluWeight.replace(",", "."));
                  if (!code) { setMessage("Введите PLU"); return; }
                  if (!Number.isFinite(kg) || kg <= 0) { setMessage("Введите вес в кг"); return; }
                  try {
                    const response = await api.get(`/products/plu/${encodeURIComponent(code)}`);
                    const product = response.data as Product;
                    addProductToCart(product, true, Math.round(kg * 1000));
                    setPluCode("");
                    setPluWeight("");
                    queueMicrotask(() => {
                      const pluInput = document.querySelector<HTMLInputElement>('input[placeholder="PLU"]');
                      pluInput?.focus();
                    });
                  } catch (err: any) {
                    const detail = err?.response?.data?.detail;
                    setMessage(detail || `Товар с PLU ${code} не найден`);
                  }
                }}
              />
              <span className="self-center text-sm text-slate-500">
                PLU → Enter → вес в кг → Enter
              </span>
            </div>
          ) : null}
          <div className="relative mb-3 flex gap-2">
            <input
              ref={searchRef}
              value={search}
              autoFocus
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && search.trim()) {
                  const exact = searchResults.find((item) => item.barcode === search.trim());
                  if (exact) addProductToCart(exact);
                  else void onAddByCode(search.trim());
                }
              }}
              className="h-12 flex-1 rounded-xl border px-4 text-base"
              placeholder="Название, штрихкод или его часть (если стёрт)"
            />
            <button
              className="flex h-12 min-w-[44px] items-center justify-center rounded-xl bg-primary px-4 text-white"
              onClick={() => {
                setScannerSession((s) => s + 1);
                setShowScanner(true);
              }}
              aria-label="Сканировать штрихкод"
            >
              {/* Иконка штрихкода (SVG inline, наследует currentColor) */}
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
                <rect x="3" y="5" width="2" height="14" />
                <rect x="6" y="5" width="1" height="14" />
                <rect x="8" y="5" width="3" height="14" />
                <rect x="12" y="5" width="1" height="14" />
                <rect x="14" y="5" width="2" height="14" />
                <rect x="17" y="5" width="1" height="14" />
                <rect x="19" y="5" width="2" height="14" />
              </svg>
            </button>

            {search.length >= 2 && searchResults.length > 0 ? (
              <div className="absolute left-0 right-0 top-14 z-20 max-h-72 overflow-auto rounded-xl border bg-white shadow">
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    className="flex w-full items-center justify-between border-b p-3 text-left last:border-b-0"
                    onClick={() => addProductToCart(item)}
                  >
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-slate-500">Остаток: {stockMap.get(item.id) ?? 0}</p>
                    </div>
                    <p className="font-semibold text-primary">{Number(item.sale_price).toFixed(2)}</p>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            {cart.length ? (
              cart.map((item, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl border p-3 transition-colors ${
                    recentAddedProductId === item.productId ? "border-emerald-400 bg-emerald-50" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      {item.warrantyMonths > 0 ? (
                        <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">
                          Гарантия {item.warrantyMonths} мес
                        </span>
                      ) : null}
                    </div>
                    <button
                      className="h-11 min-w-[44px] rounded-lg border px-3 text-red-600"
                      onClick={() => setCart((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    {item.weightGrams ? (
                      <span className="text-sm text-slate-600">
                        {(item.weightGrams / 1000).toFixed(3)} кг
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          className="h-11 min-w-[44px] rounded-lg border"
                          onClick={() =>
                            setCart((prev) =>
                              prev
                                .map((i, k) =>
                                  k === idx ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i,
                                )
                                .filter((i) => i.quantity > 0),
                            )
                          }
                        >
                          −
                        </button>
                        <span className="min-w-8 text-center text-lg font-semibold">{item.quantity}</span>
                        <button
                          className="h-11 min-w-[44px] rounded-lg border"
                          onClick={() =>
                            setCart((prev) =>
                              prev.map((i, k) => (k === idx ? { ...i, quantity: i.quantity + 1 } : i)),
                            )
                          }
                        >
                          +
                        </button>
                      </div>
                    )}
                    <div className="text-right">
                      <p className="text-xs text-slate-500">
                        {item.weightGrams
                          ? `${item.price.toFixed(2)} / кг`
                          : `${item.price.toFixed(2)} / шт`}
                      </p>
                      <p className="font-semibold">{lineTotal(item).toFixed(2)} сом</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed p-8 text-center text-slate-500">
                Добавьте товары в чек
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl bg-slate-100 p-4">
            <div className="flex justify-between text-sm">
              <span>Подытог</span>
              <span>{subtotal.toFixed(2)} сом</span>
            </div>
            {discountAmount > 0 ? (
              <div className="mt-1 flex justify-between text-sm">
                <span>Скидка клиента ({discountPercent.toFixed(0)}%)</span>
                <span>-{discountAmount.toFixed(2)} сом</span>
              </div>
            ) : null}
            <div className="mt-2 flex items-center justify-between gap-2 text-sm">
              <span>Скидка вручную</span>
              <NumberInput
                value={manualDiscountInput}
                onChange={setManualDiscountInput}
                placeholder="0"
                className="h-9 w-24 rounded-lg border px-2 text-right"
              />
            </div>
            {manualDiscount > 0 ? (
              <div className="mt-1 flex justify-between text-sm text-amber-700">
                <span>В т.ч. ручная скидка</span>
                <span>-{manualDiscount.toFixed(2)} сом</span>
              </div>
            ) : null}
            <div className="mt-2 flex justify-between text-[32px] font-bold leading-none">
              <span>ИТОГО</span>
              <span>{total.toFixed(2)}</span>
            </div>
          </div>

          <button
            className="mt-3 h-14 w-full rounded-xl bg-success text-xl font-semibold text-white md:hidden"
            onClick={() => setShowCheckoutMobile(true)}
          >
            Оформить
          </button>
        </section>

        <section
          className={`rounded-2xl bg-white p-3 shadow md:col-span-2 ${
            showCheckoutMobile ? "fixed inset-x-0 bottom-16 z-40 max-h-[80dvh] overflow-auto rounded-t-2xl pb-4" : "hidden md:block"
          }`}
        >
          <div className="mb-3 flex items-center justify-between md:hidden">
            <h3 className="text-lg font-semibold">Оформление</h3>
            <button className="text-slate-500" onClick={() => setShowCheckoutMobile(false)}>
              ✕
            </button>
          </div>

          <SectionTitle title="Клиент" />
          <input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="h-11 w-full rounded-xl border px-3"
            placeholder="Поиск по номеру телефона"
          />
          {customer ? (
            <div className="mt-2 rounded-xl border p-3">
              <p className="font-medium">{customer.name}</p>
              <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">
                Скидка {Number(customer.discount_percent ?? 0).toFixed(0)}%
              </span>
            </div>
          ) : (
            <div className="mt-2 flex gap-2">
              <button className="h-11 flex-1 rounded-xl border" onClick={() => setShowCreateCustomer(true)}>
                Добавить клиента
              </button>
              <button
                className="h-11 flex-1 rounded-xl border"
                onClick={() => {
                  setCustomer(null);
                  setCustomerPhone("");
                }}
              >
                Без клиента
              </button>
            </div>
          )}

          <SectionTitle title="Оплата" className="mt-4" />
          <div className="grid grid-cols-3 gap-2">
            <PayModeButton label="💵 Наличные" active={paymentMode === "cash"} onClick={() => setPaymentMode("cash")} />
            <PayModeButton label="💳 Карта" active={paymentMode === "card"} onClick={() => setPaymentMode("card")} />
            <PayModeButton
              label="📱 Перевод"
              active={paymentMode === "transfer"}
              onClick={() => setPaymentMode("transfer")}
            />
          </div>
          <button className="mt-2 text-sm text-primary" onClick={() => setSplitPayment((prev) => !prev)}>
            {splitPayment ? "Скрыть разделение" : "Разделить оплату"}
          </button>

          {splitPayment ? (
            <div className="mt-2 space-y-2">
              <NumberInput
                className={`h-11 w-full rounded-xl border px-3 ${!paymentValid ? "border-red-400" : ""}`}
                placeholder="Наличными: ___ сом"
                value={paidCashInput}
                onChange={setPaidCashInput}
              />
              <NumberInput
                className={`h-11 w-full rounded-xl border px-3 ${!paymentValid ? "border-red-400" : ""}`}
                placeholder="Картой: ___ сом"
                value={paidCardInput}
                onChange={setPaidCardInput}
              />
              <NumberInput
                className={`h-11 w-full rounded-xl border px-3 ${!paymentValid ? "border-red-400" : ""}`}
                placeholder="Переводом: ___ сом"
                value={paidTransferInput}
                onChange={setPaidTransferInput}
              />
            </div>
          ) : null}

          {!splitPayment ? (
            <div className="mt-2">
              <NumberInput
                className="h-11 w-full rounded-xl border px-3"
                placeholder={`Получено ${paymentMode === "cash" ? "наличными" : paymentMode === "card" ? "картой" : "переводом"}: ___ сом`}
                value={receivedInput}
                onChange={setReceivedInput}
              />
              {paymentMode === "cash" && saleType === "completed" ? (
                <p className="mt-2 text-2xl font-bold text-emerald-600">Сдача: {change.toFixed(2)} сом</p>
              ) : null}
              {saleType === "completed" && receivedInput === "" ? (
                <p className="mt-1 text-xs text-slate-500">Если поле пустое — считается полная сумма {total.toFixed(2)} сом</p>
              ) : null}
            </div>
          ) : null}

          {hasDelivery ? (
            <>
              <SectionTitle title="Доставка и установка" className="mt-4" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={needDelivery} onChange={(e) => setNeedDelivery(e.target.checked)} />
                Нужна доставка
              </label>
              {needDelivery ? (
                <div className="mt-2 space-y-2">
                  <input
                    className="h-11 w-full rounded-xl border px-3"
                    placeholder="Адрес доставки"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                  />
                  <input
                    type="date"
                    className="h-11 w-full rounded-xl border px-3"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                  />
                  <NumberInput
                    className="h-11 w-full rounded-xl border px-3"
                    placeholder="Цена доставки"
                    value={deliveryPriceInput}
                    onChange={setDeliveryPriceInput}
                  />
                  <select
                    className="h-11 w-full rounded-xl border px-3"
                    value={deliveryType}
                    onChange={(e) => setDeliveryType(e.target.value as DeliveryType)}
                  >
                    <option value="included">Включена в цену</option>
                    <option value="separate">Отдельно</option>
                  </select>
                </div>
              ) : null}

              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={needInstallation} onChange={(e) => setNeedInstallation(e.target.checked)} />
                Нужна установка
              </label>
              {needInstallation ? (
                <NumberInput
                  className="mt-2 h-11 w-full rounded-xl border px-3"
                  placeholder="Цена установки"
                  value={installationPriceInput}
                  onChange={setInstallationPriceInput}
                />
              ) : null}
            </>
          ) : null}

          <SectionTitle title="Тип продажи" className="mt-4" />
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="saleType" checked={saleType === "completed"} onChange={() => setSaleType("completed")} />
              ✅ Обычная продажа
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="saleType" checked={saleType === "debt"} onChange={() => setSaleType("debt")} />
              📋 Долг
            </label>
          </div>

          {saleType === "debt" ? (
            <input
              type="date"
              className="mt-2 h-11 w-full rounded-xl border px-3"
              value={debtDate}
              onChange={(e) => setDebtDate(e.target.value)}
            />
          ) : null}

          {needsCustomer && !customer ? <p className="mt-2 text-sm text-amber-700">Выберите клиента для долга</p> : null}
          {!paymentValid ? (
            <p className="mt-2 text-sm text-red-600">
              {saleType === "completed"
                ? "Сумма оплаты должна совпадать с итогом"
                : "Сумма оплаты не может превышать итог"}
            </p>
          ) : null}
          {paymentValid && saleType === "debt" && remainingDebt > 0 ? (
            <p className="mt-2 text-sm font-semibold text-amber-700">В долг: {remainingDebt.toFixed(2)} сом</p>
          ) : null}
          {message ? <p className="mt-2 text-sm text-amber-700">{message}</p> : null}

          <button
            type="button"
            disabled={!canCheckout}
            onClick={() => checkoutMutation.mutate()}
            className="mt-4 h-14 w-full rounded-xl bg-success text-xl font-semibold text-white disabled:opacity-50"
          >
            Оформить продажу
          </button>
        </section>
      </div>

      {showCreateCustomer ? (
        <div className="fixed inset-0 z-40 bg-black/40 p-4">
          <div className="mx-auto max-w-md rounded-2xl bg-white p-4">
            <h3 className="text-xl font-semibold">Добавить клиента</h3>
            <div className="mt-3 space-y-2">
              <input
                ref={newCustomerNameRef}
                className="h-11 w-full rounded-xl border px-3"
                placeholder="Имя"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
              />
              <input
                className="h-11 w-full rounded-xl border px-3"
                placeholder="Телефон"
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
              />
              <NumberInput
                className="h-11 w-full rounded-xl border px-3"
                placeholder="Скидка %"
                value={newCustomerDiscount}
                onChange={setNewCustomerDiscount}
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                className="h-11 flex-1 rounded-xl bg-primary text-white"
                onClick={() => createCustomerMutation.mutate()}
              >
                Сохранить
              </button>
              <button className="h-11 flex-1 rounded-xl border" onClick={() => setShowCreateCustomer(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showScanner ? (
        <BarcodeScanner
          key={scannerSession}
          onDetected={(code) => {
            return (async () => {
              const clean = code.trim().replace(/\s+/g, "");
              const ok = await onAddByCode(code);
              return {
                ok,
                message: ok ? `✓ В корзину: ${clean}` : `✗ Нет в каталоге: ${clean}`,
                autoClose: ok,
              };
            })();
          }}
          onClose={() => setShowScanner(false)}
        />
      ) : null}

      {successOverlay ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-600/95 p-4 text-white">
          <div className="w-full max-w-lg rounded-2xl bg-emerald-700 p-6 text-center">
            <div className="text-6xl">✓</div>
            <h2 className="mt-2 text-3xl font-bold">Продажа оформлена!</h2>
            <p className="mt-2 text-4xl font-bold">{successOverlay.total.toFixed(2)} сом</p>
            {successOverlay.customerName ? <p className="mt-1 text-lg">{successOverlay.customerName}</p> : null}
            <div className="mt-5">
              <button
                className="h-11 w-full rounded-xl bg-white/20 disabled:opacity-50"
                disabled={!successOverlay.saleId}
                onClick={() => printReceipt(successOverlay.saleId)}
              >
                Напечатать чек
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function SectionTitle({ title, className = "" }: { title: string; className?: string }) {
  return <h3 className={`mb-2 text-sm font-semibold uppercase text-slate-500 ${className}`}>{title}</h3>;
}

function PayModeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-11 rounded-xl border text-sm ${active ? "border-primary bg-indigo-50 text-primary" : "bg-white"}`}
    >
      {label}
    </button>
  );
}
