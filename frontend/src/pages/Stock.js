import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { NumberInput } from "../components/NumberInput";
import { useBusinessSettings } from "../hooks/useBusinessSettings";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";
const today = () => new Date().toISOString().slice(0, 10);
const moneyFmt = (value) => {
    const n = typeof value === "string" ? Number(value) : value ?? 0;
    return Number.isFinite(n) ? n.toFixed(2) : "0.00";
};
/** "1400,00" / "1 400.50" → число (для локальных клавиатур) */
function parseMoney(raw) {
    const s = String(raw ?? "")
        .trim()
        .replace(/\s/g, "")
        .replace(/,/g, ".");
    if (!s)
        return 0;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
}
function formatMoneyFromApi(value) {
    if (value === null || value === undefined)
        return "0";
    if (typeof value === "number")
        return String(value);
    return String(parseMoney(String(value)));
}
function extractAxiosDetail(error) {
    if (!axios.isAxiosError(error))
        return String(error);
    const d = error.response?.data?.detail;
    if (typeof d === "string")
        return d;
    if (Array.isArray(d)) {
        return d
            .map((item) => typeof item === "object" && item !== null && "msg" in item
            ? String(item.msg)
            : JSON.stringify(item))
            .join("; ");
    }
    if (d != null && typeof d === "object")
        return JSON.stringify(d);
    return error.message;
}
async function fetchBarcodeDataUrl(productId) {
    try {
        const res = await api.get(`/products/${productId}/barcode/image`, { responseType: "blob" });
        return await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onloadend = () => resolve(r.result);
            r.onerror = reject;
            r.readAsDataURL(res.data);
        });
    }
    catch {
        return null;
    }
}
const modalOverlay = "fixed inset-0 z-50 bg-black/50 p-4";
const MOVEMENT_TYPE_LABEL = {
    in: "Приход",
    out: "Расход",
    writeoff: "Списание",
};
// max-h учитывает мобильный таб-бар (≈72px) + safe-area-inset-bottom (notch/home indicator),
// иначе кнопки внизу модалки закрываются нижним меню и не доскроллить.
// pb-24 — внутренний хвостик контента, чтобы последняя кнопка не упиралась в край.
const modalCard = "mx-auto mt-8 max-w-2xl rounded-2xl bg-white p-5 pb-24 shadow-xl overflow-y-auto " +
    "max-h-[calc(100dvh-96px-env(safe-area-inset-bottom))] md:max-h-[92vh] md:pb-5";
/** Кнопки панели склада: без фикс. height — иначе двухстрочный текст обрезается */
const stockToolbarBtn = "inline-flex min-h-11 min-w-0 max-w-full shrink-0 items-center justify-center rounded-xl px-3 py-2 text-center text-sm font-medium leading-snug";
export function StockPage() {
    const isOwner = useAuthStore((s) => s.role === "owner");
    const role = useAuthStore((s) => s.role);
    const canEditMovements = role === "owner" || role === "warehouse";
    const { type: businessType, hasExpiryDate } = useBusinessSettings();
    const isGrocery = businessType === "grocery";
    // Состояние редактирования движения склада (приход/расход/списание).
    const [editingMovement, setEditingMovement] = useState(null);
    const [editMovementQty, setEditMovementQty] = useState("");
    const [editMovementCost, setEditMovementCost] = useState("");
    const [editMovementReason, setEditMovementReason] = useState("");
    const suppliersQuery = useQuery({
        queryKey: ["suppliers"],
        queryFn: async () => (await api.get("/suppliers")).data,
        enabled: isGrocery,
    });
    const queryClient = useQueryClient();
    const [mode, setMode] = useState("stock");
    const [search, setSearch] = useState("");
    const [movementFilter, setMovementFilter] = useState("");
    const [message, setMessage] = useState("");
    const [showScanner, setShowScanner] = useState(false);
    const [scanContext, setScanContext] = useState("header");
    const [inModalScanning, setInModalScanning] = useState(false);
    const [outModalScanning, setOutModalScanning] = useState(false);
    const [scanActionProduct, setScanActionProduct] = useState(null);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [barcodePreviewUrl, setBarcodePreviewUrl] = useState(null);
    const [barcodePreviewLoading, setBarcodePreviewLoading] = useState(false);
    const [showInModal, setShowInModal] = useState(false);
    const [showOutModal, setShowOutModal] = useState(false);
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [selectedProductId, setSelectedProductId] = useState("");
    const [inProductSearch, setInProductSearch] = useState("");
    const [outProductSearch, setOutProductSearch] = useState("");
    const [qty, setQty] = useState("1");
    const [purchasePrice, setPurchasePrice] = useState("");
    const [retailPrice, setRetailPrice] = useState("");
    const [comment, setComment] = useState("");
    const [movementDate, setMovementDate] = useState(today());
    const [productionDate, setProductionDate] = useState("");
    const [expiryDate, setExpiryDate] = useState("");
    const [batchNumber, setBatchNumber] = useState("");
    const [supplierIn, setSupplierIn] = useState("");
    const [expiringOnly, setExpiringOnly] = useState(false);
    // Категория списания (writeoff_reason). Соответствует enum на бэке.
    const [outType, setOutType] = useState("expired");
    const [outReason, setOutReason] = useState("");
    const [inReceiptMode, setInReceiptMode] = useState("existing");
    const [newProductName, setNewProductName] = useState("");
    const [newProductMinStock, setNewProductMinStock] = useState("1");
    const [newCardBarcode, setNewCardBarcode] = useState("");
    const [useAutoBarcode, setUseAutoBarcode] = useState(false);
    // Grocery-поля (показываются только если isGrocery)
    const [newProductCategory, setNewProductCategory] = useState("");
    const [newProductKind, setNewProductKind] = useState("piece");
    const [newProductUnit, setNewProductUnit] = useState("шт");
    const [newProductPlu, setNewProductPlu] = useState("");
    const [newProductShelfLife, setNewProductShelfLife] = useState("");
    const [newProductStorageTemp, setNewProductStorageTemp] = useState("");
    // Поле «Поставщик» в модалке нового товара: храним введённое имя, при сохранении
    // ищем supplier_id в базе.
    const [newProductManufacturer, setNewProductManufacturer] = useState("");
    const [barcodeMiss, setBarcodeMiss] = useState(null);
    const [newProductWarranty, setNewProductWarranty] = useState("");
    const [inModalScanInfo, setInModalScanInfo] = useState(null);
    const [inFormTouched, setInFormTouched] = useState(false);
    const [inModalError, setInModalError] = useState("");
    const [outModalError, setOutModalError] = useState("");
    const [inManualMode, setInManualMode] = useState(false);
    const [outManualMode, setOutManualMode] = useState(false);
    const [inManualBarcode, setInManualBarcode] = useState("");
    const [outManualBarcode, setOutManualBarcode] = useState("");
    const [salesSearch, setSalesSearch] = useState("");
    const [selectedSale, setSelectedSale] = useState(null);
    const [returnReason, setReturnReason] = useState("");
    const [refundMethod, setRefundMethod] = useState("cash");
    const [returnSelectedItems, setReturnSelectedItems] = useState([]);
    // New return-by-product state
    const [returnProductSearch, setReturnProductSearch] = useState("");
    const [returnProduct, setReturnProduct] = useState(null);
    const [revisionFactual, setRevisionFactual] = useState({});
    const [revisionScanTime, setRevisionScanTime] = useState({});
    const [revisionMissing, setRevisionMissing] = useState({});
    const [revisionScannerOn, setRevisionScannerOn] = useState(false);
    const [revisionSearch, setRevisionSearch] = useState("");
    const [revisionShowMissing, setRevisionShowMissing] = useState(false);
    // false = просмотр истории; true = активная сессия сканирования
    const [revisionActive, setRevisionActive] = useState(false);
    const [movementsPage, setMovementsPage] = useState(1);
    // Bulk barcode print mode
    const [barcodeSelectMode, setBarcodeSelectMode] = useState(false);
    const [selectedForBarcode, setSelectedForBarcode] = useState(new Set());
    // Сессия сканера — меняется при каждом открытии и (для ревизии) после каждого
    // скана, чтобы React пересоздавал MediaStream и iOS заново наводил автофокус.
    const [scannerSession, setScannerSession] = useState(0);
    const isDesktop = typeof window !== "undefined" ? window.innerWidth > 768 : false;
    const incomingTotal = Math.max(0, Number(qty || 0) * parseMoney(purchasePrice));
    const inQtyInvalid = inFormTouched && (Number(qty) < 1 || Number(qty) > 9999);
    const productsQuery = useQuery({
        queryKey: ["products-all"],
        queryFn: async () => (await api.get("/products")).data,
    });
    const stockQuery = useQuery({
        queryKey: ["stock-summary"],
        queryFn: async () => (await api.get("/stock")).data,
    });
    const lastRevisionQuery = useQuery({
        queryKey: ["last-revision"],
        queryFn: async () => {
            try {
                return (await api.get("/stock/revisions/last")).data;
            }
            catch {
                return { found: false };
            }
        },
    });
    const movementsQuery = useQuery({
        queryKey: ["stock-movements"],
        queryFn: async () => {
            try {
                // Bigger limit so the "sort by last incoming" on the products list has enough history.
                return (await api.get("/stock/movements", { params: { limit: 1000 } })).data;
            }
            catch {
                return [];
            }
        },
    });
    const salesQuery = useQuery({
        queryKey: ["sales-completed-legacy", salesSearch],
        enabled: false, // legacy: replaced by per-product search in the new return modal
        queryFn: async () => {
            const response = await api.get("/sales", { params: { status: "completed" } });
            const list = Array.isArray(response.data) ? response.data : [];
            return list.filter((sale) => !salesSearch ||
                String(sale.id).includes(salesSearch) ||
                String(sale.created_at ?? "").slice(0, 10).includes(salesSearch));
        },
    });
    const inModalProductsQuery = useQuery({
        queryKey: ["stock-in-product-search", inProductSearch],
        enabled: showInModal && inReceiptMode === "existing" && inProductSearch.trim().length >= 2,
        queryFn: async () => (await api.get("/products", { params: { q: inProductSearch.trim(), search: inProductSearch.trim() } })).data,
    });
    const outModalProductsQuery = useQuery({
        queryKey: ["stock-out-product-search", outProductSearch],
        enabled: showOutModal && outProductSearch.trim().length >= 2,
        queryFn: async () => (await api.get("/products", { params: { q: outProductSearch.trim(), search: outProductSearch.trim() } })).data,
    });
    const stockMap = useMemo(() => new Map((stockQuery.data ?? []).map((row) => [row.product_id, row.balance])), [stockQuery.data]);
    const expiryMap = useMemo(() => new Map((stockQuery.data ?? [])
        .filter((row) => row.min_expiry_date)
        .map((row) => [row.product_id, row.min_expiry_date])), [stockQuery.data]);
    /** Возвращает дни до истечения (отрицательное = просрочен) и цвет-класс бейджа. */
    const expiryInfo = (productId) => {
        const dateStr = expiryMap.get(productId);
        if (!dateStr)
            return null;
        const target = new Date(dateStr + "T00:00:00");
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const days = Math.floor((target.getTime() - now.getTime()) / 86400000);
        if (days < 0)
            return { days, classes: "bg-rose-100 text-rose-700", label: `Просрочен на ${Math.abs(days)} дн` };
        if (days === 0)
            return { days, classes: "bg-rose-100 text-rose-700", label: "Истекает сегодня" };
        if (days <= 3)
            return { days, classes: "bg-amber-100 text-amber-700", label: `${days} дн` };
        if (days <= 7)
            return { days, classes: "bg-orange-100 text-orange-700", label: `${days} дн` };
        return { days, classes: "bg-emerald-100 text-emerald-700", label: `${days} дн` };
    };
    const expiringSoonCount = useMemo(() => {
        if (!isGrocery)
            return 0;
        return (stockQuery.data ?? []).filter((row) => {
            if (!row.min_expiry_date)
                return false;
            const target = new Date(row.min_expiry_date + "T00:00:00");
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const days = Math.floor((target.getTime() - now.getTime()) / 86400000);
            return days <= 3;
        }).length;
    }, [stockQuery.data, isGrocery]);
    const products = productsQuery.data ?? [];
    /** Если товар визуально «выбран» (одна строка в поиске / точное имя), подставляем id без обязательного клика */
    function resolveIncomingProductId() {
        if (selectedProductId !== "")
            return Number(selectedProductId);
        const q = inProductSearch.trim().toLowerCase();
        if (!q)
            return null;
        const fromDropdown = inModalProductsQuery.data ?? [];
        if (fromDropdown.length === 1)
            return fromDropdown[0].id;
        const exactDrop = fromDropdown.find((p) => p.name.trim().toLowerCase() === q);
        if (exactDrop)
            return exactDrop.id;
        const exactCat = products.find((p) => p.name.trim().toLowerCase() === q);
        return exactCat?.id ?? null;
    }
    function resolveOutgoingProductId() {
        if (selectedProductId !== "")
            return Number(selectedProductId);
        const q = outProductSearch.trim().toLowerCase();
        if (!q)
            return null;
        const fromDropdown = outModalProductsQuery.data ?? [];
        if (fromDropdown.length === 1)
            return fromDropdown[0].id;
        const exactDrop = fromDropdown.find((p) => p.name.trim().toLowerCase() === q);
        if (exactDrop)
            return exactDrop.id;
        const exactCat = products.find((p) => p.name.trim().toLowerCase() === q);
        return exactCat?.id ?? null;
    }
    const resolvedIncomingId = resolveIncomingProductId();
    const inProductInvalid = inReceiptMode === "existing" &&
        inFormTouched &&
        !resolvedIncomingId &&
        selectedProductId === "";
    const qSearch = inProductSearch.trim();
    const searchFetching = inModalProductsQuery.isFetching && qSearch.length >= 2;
    const nameSearchEmpty = inReceiptMode === "existing" &&
        !searchFetching &&
        inModalProductsQuery.isFetched &&
        qSearch.length >= 2 &&
        (inModalProductsQuery.data ?? []).length === 0;
    const showNameMissOffer = nameSearchEmpty && selectedProductId === "" && !resolvedIncomingId && !barcodeMiss;
    const showBarcodeMissOffer = Boolean(barcodeMiss) && inReceiptMode === "existing" && selectedProductId === "";
    /** После выбора товара из списка поле совпадает с названием — не держим выпадашку (перекрывает форму) */
    const selectedStockProduct = selectedProductId !== "" ? products.find((p) => p.id === Number(selectedProductId)) : undefined;
    const inProductSearchCommitted = Boolean(selectedStockProduct &&
        selectedStockProduct.name.trim().toLowerCase() === inProductSearch.trim().toLowerCase());
    const showInProductDropdown = inReceiptMode === "existing" &&
        inProductSearch.trim().length >= 2 &&
        !inProductSearchCommitted;
    const outProductSearchCommitted = Boolean(selectedStockProduct &&
        selectedStockProduct.name.trim().toLowerCase() === outProductSearch.trim().toLowerCase());
    const showOutProductDropdown = showOutModal && outProductSearch.trim().length >= 2 && !outProductSearchCommitted;
    const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
    // Build a map: product_id → timestamp of the most recent in-stock movement
    // (used to sort products by «last incoming first»; products without movements fall back to id).
    const lastIncomingByProduct = new Map();
    (movementsQuery.data ?? []).forEach((m) => {
        if (m.type !== "in" || !m.created_at)
            return;
        const ts = new Date(m.created_at).getTime();
        const prev = lastIncomingByProduct.get(m.product_id) ?? 0;
        if (ts > prev)
            lastIncomingByProduct.set(m.product_id, ts);
    });
    const rows = (stockQuery.data ?? [])
        .map((stockRow) => {
        const product = productMap.get(stockRow.product_id);
        if (!product)
            return null;
        return {
            ...product,
            balance: Number(stockRow.balance ?? 0),
            min_stock: Number(product.min_stock ?? 0),
            last_cost_price: stockRow.last_cost_price != null ? Number(stockRow.last_cost_price) : null,
            margin_pct: stockRow.margin_pct != null ? Number(stockRow.margin_pct) : null,
        };
    })
        .filter((row) => Boolean(row))
        .filter((row) => row.name.toLowerCase().includes(search.toLowerCase()))
        .filter((row) => {
        if (!expiringOnly)
            return true;
        const info = expiryInfo(row.id);
        return info != null && info.days <= 3;
    })
        .sort((a, b) => {
        // Primary: most recent incoming first; products without history go below those with history,
        // sorted by id desc among themselves.
        const aLast = lastIncomingByProduct.get(a.id) ?? 0;
        const bLast = lastIncomingByProduct.get(b.id) ?? 0;
        if (aLast !== bLast)
            return bLast - aLast;
        return b.id - a.id;
    });
    const allFilteredMovements = (movementsQuery.data ?? []).filter((m) => !movementFilter || m.type === movementFilter);
    const movementsPageSize = 20;
    const movementsTotalPages = Math.max(1, Math.ceil(allFilteredMovements.length / movementsPageSize));
    const currentMovementsPage = Math.min(movementsPage, movementsTotalPages);
    const filteredMovements = allFilteredMovements.slice((currentMovementsPage - 1) * movementsPageSize, currentMovementsPage * movementsPageSize);
    const selectedProductMovements = filteredMovements.filter((m) => m.product_id === selectedProduct?.id).slice(0, 10);
    useEffect(() => {
        if (!selectedProduct?.barcode) {
            setBarcodePreviewUrl(null);
            setBarcodePreviewLoading(false);
            return;
        }
        let cancelled = false;
        setBarcodePreviewLoading(true);
        void fetchBarcodeDataUrl(selectedProduct.id).then((url) => {
            if (!cancelled) {
                setBarcodePreviewUrl(url);
                setBarcodePreviewLoading(false);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [selectedProduct?.id, selectedProduct?.barcode]);
    const openInModal = (productId, opts) => {
        if (opts?.newProductOnly) {
            setInReceiptMode("create");
            setSelectedProductId("");
            setInProductSearch("");
            setNewProductName("");
            setNewProductWarranty("0");
            setNewProductMinStock("1");
            setNewCardBarcode("");
            setUseAutoBarcode(false);
            setBarcodeMiss(null);
            setNewProductCategory("");
            setNewProductKind("piece");
            setNewProductUnit("шт");
            setNewProductPlu("");
            setNewProductShelfLife("");
            setNewProductStorageTemp("");
            setNewProductManufacturer("");
            setQty("1");
            setPurchasePrice("0");
            setRetailPrice("0");
            setComment("");
            setMovementDate(today());
            setInModalScanning(false);
            setInModalScanInfo(null);
            setInFormTouched(false);
            setInModalError("");
            setInManualMode(false);
            setInManualBarcode("");
            setShowInModal(true);
            return;
        }
        const preselected = productId ? products.find((p) => p.id === productId) : null;
        setInReceiptMode("existing");
        setSelectedProductId(productId ?? "");
        setInProductSearch(preselected?.name ?? "");
        setQty("1");
        // Подставляем последнюю закупочную цену товара (если есть). Кассир может перебить.
        setPurchasePrice(preselected && Number(preselected.purchase_price ?? 0) > 0
            ? String(preselected.purchase_price)
            : "");
        setRetailPrice(preselected ? String(preselected.sale_price ?? 0) : "0");
        setComment("");
        setMovementDate(today());
        setProductionDate("");
        setExpiryDate("");
        setBatchNumber("");
        setSupplierIn("");
        setInModalScanning(false);
        setInModalScanInfo(null);
        setInFormTouched(false);
        setInModalError("");
        setInManualMode(false);
        setInManualBarcode("");
        setBarcodeMiss(null);
        setShowInModal(true);
    };
    const openOutModal = (productId) => {
        const preselected = productId ? products.find((p) => p.id === productId) : null;
        setSelectedProductId(productId ?? "");
        setOutProductSearch(preselected?.name ?? "");
        setQty("1");
        setOutReason("");
        setOutType("expired");
        setMovementDate(today());
        setOutModalScanning(false);
        setOutModalError("");
        setOutManualMode(false);
        setOutManualBarcode("");
        setShowOutModal(true);
    };
    const movementMutation = useMutation({
        mutationFn: async (payload) => {
            await api.post("/stock/movement", payload);
        },
        onSuccess: async () => {
            setShowInModal(false);
            setShowOutModal(false);
            await queryClient.invalidateQueries({ queryKey: ["stock-summary"] });
            await queryClient.invalidateQueries({ queryKey: ["stock"] });
            await queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
            await queryClient.invalidateQueries({ queryKey: ["products-all"] });
            await queryClient.invalidateQueries({ queryKey: ["products"] });
            setMessage("Движение сохранено");
        },
        onError: (error) => {
            const details = extractAxiosDetail(error);
            setInModalError(details);
            setOutModalError(details);
            setMessage(`Ошибка сохранения движения: ${details}`);
        },
    });
    // Редактирование уже сохранённого движения (приход/расход/списание).
    // Кассир может ошибиться при ИИ-распознавании — даём возможность поправить количество и цену.
    const updateMovementMutation = useMutation({
        mutationFn: async () => {
            if (!editingMovement)
                throw new Error("no movement");
            const isWeighed = editingMovement.quantity_decimal != null;
            const qtyNum = Number(String(editMovementQty).replace(",", ".")) || 0;
            const payload = {
                reason: editMovementReason || null,
                cost_price: editMovementCost ? Number(String(editMovementCost).replace(",", ".")) : null,
            };
            if (isWeighed) {
                payload.quantity = 0;
                payload.quantity_decimal = qtyNum;
            }
            else {
                payload.quantity = Math.max(0, Math.floor(qtyNum));
                payload.quantity_decimal = null;
            }
            await api.put(`/stock/movements/${editingMovement.id}`, payload);
        },
        onSuccess: async () => {
            setEditingMovement(null);
            await queryClient.invalidateQueries({ queryKey: ["stock-summary"] });
            await queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
            await queryClient.invalidateQueries({ queryKey: ["stock"] });
            setMessage("Движение обновлено");
        },
        onError: (err) => setMessage(`Не удалось обновить: ${extractAxiosDetail(err)}`),
    });
    const deleteMovementMutation = useMutation({
        mutationFn: async (id) => {
            await api.delete(`/stock/movements/${id}`);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["stock-summary"] });
            await queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
            await queryClient.invalidateQueries({ queryKey: ["stock"] });
            setMessage("Движение удалено, остаток пересчитан");
        },
        onError: (err) => setMessage(`Не удалось удалить: ${extractAxiosDetail(err)}`),
    });
    const generateBarcodeMutation = useMutation({
        mutationFn: async (productId) => {
            await api.post(`/products/${productId}/barcode`);
            await queryClient.invalidateQueries({ queryKey: ["products-all"] });
            setMessage("Штрихкод сгенерирован");
        },
        onError: () => setMessage("Не удалось сгенерировать штрихкод"),
    });
    const createProductAndReceiptMutation = useMutation({
        mutationFn: async () => {
            const q = Math.min(9999, Math.max(1, Math.floor(Number(qty))));
            const productPayload = {
                name: newProductName.trim(),
                warranty_months: isGrocery ? 0 : Math.max(0, Number(newProductWarranty) || 0),
                min_stock: Math.max(0, Number(newProductMinStock) || 0),
                sale_price: parseMoney(retailPrice),
                purchase_price: parseMoney(purchasePrice),
                barcode_generated: useAutoBarcode,
                ...(useAutoBarcode ? {} : { barcode: newCardBarcode.trim() }),
            };
            if (isGrocery) {
                productPayload.category = newProductCategory || null;
                productPayload.kind = newProductKind;
                productPayload.unit = newProductUnit || null;
                productPayload.weighing_code = newProductKind === "weighed" ? newProductPlu || null : null;
                productPayload.shelf_life_days = newProductShelfLife ? Number(newProductShelfLife) : null;
                productPayload.storage_temp = newProductStorageTemp || null;
                // Поставщик: ищем по введённому имени в базе. Если нет — supplier_id остаётся null,
                // юзер получит подсказку добавить в раздел «Поставщики».
                const supName = newProductManufacturer.trim();
                const supMatch = supName
                    ? (suppliersQuery.data ?? []).find((s) => s.name === supName)
                    : null;
                productPayload.supplier_id = supMatch ? supMatch.id : null;
            }
            const created = (await api.post("/products", productPayload)).data;
            const supTrim = supplierIn.trim();
            const supId = supTrim
                ? (suppliersQuery.data ?? []).find((s) => s.name === supTrim)?.id ?? null
                : null;
            const isWeighed = newProductKind === "weighed";
            await api.post("/stock/movement", {
                product_id: created.id,
                quantity: isWeighed ? 0 : q,
                quantity_decimal: isWeighed ? Number(Number(qty).toFixed(3)) : null,
                type: "in",
                reason: comment.trim() || undefined,
                cost_price: parseMoney(purchasePrice) || null,
                ...(isGrocery
                    ? {
                        production_date: productionDate || null,
                        expiry_date: expiryDate || null,
                        batch_number: batchNumber.trim() || null,
                        supplier: supTrim || null,
                        supplier_id: supId,
                    }
                    : {}),
            });
            return { created, qty: q };
        },
        onSuccess: async (result) => {
            await queryClient.invalidateQueries({ queryKey: ["stock-summary"] });
            await queryClient.invalidateQueries({ queryKey: ["stock"] });
            await queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
            await queryClient.invalidateQueries({ queryKey: ["products-all"] });
            await queryClient.invalidateQueries({ queryKey: ["products"] });
            setShowInModal(false);
            setMessage(`✓ Товар '${result.created.name}' создан и оприходован (${result.qty} шт.)`);
        },
        onError: (error) => {
            const details = extractAxiosDetail(error);
            setInModalError(details);
            setMessage(`Ошибка: ${details}`);
        },
    });
    const salesByProductQuery = useQuery({
        queryKey: ["sales-by-product", returnProduct?.id],
        enabled: showReturnModal && returnProduct !== null,
        queryFn: async () => {
            const response = await api.get(`/sales/by-product/${returnProduct.id}`);
            return (Array.isArray(response.data) ? response.data : []);
        },
    });
    const returnMutation = useMutation({
        mutationFn: async () => {
            if (!selectedSale)
                return;
            await api.post(`/sales/${selectedSale.id}/return`, {
                return_item_ids: returnSelectedItems,
                reason: returnReason || undefined,
                refund_method: refundMethod,
            });
        },
        onSuccess: async () => {
            setShowReturnModal(false);
            setSelectedSale(null);
            setReturnReason("");
            setReturnSelectedItems([]);
            setReturnProduct(null);
            setReturnProductSearch("");
            await queryClient.invalidateQueries({ queryKey: ["stock-summary"] });
            await queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
            await queryClient.invalidateQueries({ queryKey: ["sales-by-product"] });
            setMessage("✓ Возврат проведён");
        },
        onError: (error) => setMessage(`Ошибка возврата: ${extractAxiosDetail(error)}`),
    });
    const finishRevisionMutation = useMutation({
        mutationFn: async () => {
            // Send only changes: scanned products with actual qty + products marked as missing.
            // Untouched products (not scanned and not marked) keep their current balance — not sent.
            const items = [];
            rows.forEach((row) => {
                if (row.id in revisionFactual) {
                    items.push({
                        product_id: row.id,
                        expected_qty: row.balance,
                        actual_qty: Math.max(0, Math.floor(Number(revisionFactual[row.id]))),
                    });
                }
                else if (revisionMissing[row.id]) {
                    items.push({
                        product_id: row.id,
                        expected_qty: row.balance,
                        actual_qty: 0,
                    });
                }
            });
            if (!items.length) {
                throw new Error("Нет изменений для применения");
            }
            await api.post("/stock/revision", { items });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["stock-summary"] });
            await queryClient.invalidateQueries({ queryKey: ["stock"] });
            await queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
            setRevisionFactual({});
            setRevisionScanTime({});
            setRevisionMissing({});
            setRevisionScannerOn(false);
            setRevisionSearch("");
            setRevisionShowMissing(false);
            setRevisionActive(false);
            await queryClient.invalidateQueries({ queryKey: ["last-revision"] });
            setMessage("✓ Ревизия сохранена");
        },
        onError: (error) => {
            const detail = error instanceof Error ? error.message : extractAxiosDetail(error);
            setMessage(`Ошибка ревизии: ${detail}`);
        },
    });
    const printBarcode = async (product) => {
        const printWindow = window.open("", "_blank", "width=500,height=700");
        if (!printWindow)
            return;
        let imgBlock = "<div>Штрихкод отсутствует</div>";
        if (product.barcode) {
            const dataUrl = await fetchBarcodeDataUrl(product.id);
            imgBlock = dataUrl
                ? `<img src="${dataUrl}" alt="barcode" style="max-width:100%;height:auto;" />`
                : "<div>Не удалось загрузить изображение штрихкода</div>";
        }
        const html = `
      <html>
        <head>
          <title>Штрихкод</title>
          <style>
            body { font-family: Arial, sans-serif; background: #fff; color: #000; padding: 24px; }
            .wrap { text-align: center; }
            .name { font-size: 18px; margin-bottom: 8px; }
            .price { font-size: 20px; font-weight: bold; margin-top: 8px; }
          </style>
        </head>
        <body>
          <div class="wrap">
            <div class="name">${product.name}</div>
            ${imgBlock}
            <div>${product.barcode ?? ""}</div>
            <div class="price">${Number(product.sale_price ?? 0).toFixed(2)} сом</div>
          </div>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `;
        printWindow.document.write(html);
        printWindow.document.close();
    };
    const printBarcodesBatch = async (productIds) => {
        if (!productIds.length)
            return;
        const printWindow = window.open("", "_blank", "width=900,height=700");
        if (!printWindow) {
            setMessage("Браузер заблокировал всплывающее окно. Разрешите его и попробуйте снова.");
            return;
        }
        // Show a "loading" placeholder while we fetch barcode images sequentially.
        printWindow.document.write("<html><body style=\"font-family:Arial;padding:24px\">Загрузка штрихкодов…</body></html>");
        const items = [];
        for (const id of productIds) {
            const p = products.find((x) => x.id === id);
            if (!p)
                continue;
            const dataUrl = p.barcode ? await fetchBarcodeDataUrl(p.id) : null;
            items.push({
                name: p.name,
                barcode: p.barcode || "",
                price: Number(p.sale_price ?? 0),
                dataUrl,
            });
        }
        const itemsJson = JSON.stringify(items);
        // Self-contained printable page: cards laid out on a CSS grid.
        // Top toolbar: cols, card width (mm), repeats per item, "show name/price" toggles, Print button.
        const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"/><title>Печать штрихкодов</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:Arial,sans-serif;background:#f5f5f5}
  .toolbar{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:12px 16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;z-index:10}
  .toolbar label{display:flex;align-items:center;gap:6px;font-size:14px}
  .toolbar input[type=number]{width:64px;padding:4px 6px;border:1px solid #ccc;border-radius:4px}
  .toolbar button{background:#4F46E5;color:#fff;border:0;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:14px}
  .toolbar .hint{color:#666;font-size:12px}
  .sheet{padding:8mm;background:#fff;margin:8px auto;max-width:210mm;min-height:297mm;display:grid;gap:2mm;align-content:start}
  .card{border:1px dashed #999;padding:2mm;text-align:center;page-break-inside:avoid;display:flex;flex-direction:column;justify-content:center;align-items:center}
  .card .name{font-size:9pt;line-height:1.1;margin-bottom:1mm;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%}
  .card img{display:block;max-width:100%;height:auto}
  .card .code{font-family:monospace;font-size:8pt;margin-top:1mm}
  .card .price{font-weight:bold;font-size:10pt;margin-top:1mm}
  @media print{
    .toolbar{display:none}
    body{background:#fff}
    .sheet{margin:0;padding:6mm}
  }
</style>
</head><body>
<div class="toolbar">
  <label>Колонок: <input type="number" id="cols" value="3" min="1" max="10"/></label>
  <label>Высота (мм): <input type="number" id="height" value="22" min="10" max="60"/></label>
  <label>Повторов на товар: <input type="number" id="repeats" value="1" min="1" max="50"/></label>
  <label><input type="checkbox" id="showName" checked/> Название</label>
  <label><input type="checkbox" id="showPrice" checked/> Цена</label>
  <label><input type="checkbox" id="showCode" checked/> Цифры под кодом</label>
  <button onclick="window.print()">🖨 Печать</button>
  <span class="hint">Превью обновляется при изменении настроек. Лист A4.</span>
</div>
<div class="sheet" id="sheet"></div>
<script>
  const items = ${itemsJson};
  function render() {
    const cols = Math.max(1, Math.min(10, parseInt(document.getElementById("cols").value) || 3));
    const height = Math.max(10, Math.min(60, parseInt(document.getElementById("height").value) || 22));
    const repeats = Math.max(1, Math.min(50, parseInt(document.getElementById("repeats").value) || 1));
    const showName = document.getElementById("showName").checked;
    const showPrice = document.getElementById("showPrice").checked;
    const showCode = document.getElementById("showCode").checked;
    const sheet = document.getElementById("sheet");
    sheet.style.gridTemplateColumns = "repeat(" + cols + ", 1fr)";
    sheet.style.gridAutoRows = height + "mm";
    sheet.innerHTML = "";
    items.forEach((it) => {
      for (let r = 0; r < repeats; r++) {
        const card = document.createElement("div");
        card.className = "card";
        const parts = [];
        if (showName) parts.push('<div class="name">' + escapeHtml(it.name) + '</div>');
        if (it.dataUrl) parts.push('<img src="' + it.dataUrl + '" />');
        else parts.push('<div style="font-size:9pt;color:#999">нет штрихкода</div>');
        if (showCode && it.barcode) parts.push('<div class="code">' + escapeHtml(it.barcode) + '</div>');
        if (showPrice) parts.push('<div class="price">' + it.price.toFixed(2) + ' сом</div>');
        card.innerHTML = parts.join("");
        sheet.appendChild(card);
      }
    });
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c]));
  }
  ["cols","height","repeats","showName","showPrice","showCode"].forEach((id) => {
    document.getElementById(id).addEventListener("input", render);
    document.getElementById(id).addEventListener("change", render);
  });
  render();
</script>
</body></html>`;
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
    };
    const openProductCard = (p) => {
        setBarcodePreviewLoading(true);
        setBarcodePreviewUrl(null);
        setSelectedProduct(p);
    };
    const findProductByBarcode = async (code) => {
        let found = products.find((p) => p.barcode === code);
        if (!found) {
            try {
                const response = await api.get(`/products/barcode/${code}`);
                found = response.data;
            }
            catch {
                found = undefined;
            }
        }
        return found;
    };
    const onScanned = async (code) => {
        const found = await findProductByBarcode(code);
        if (found) {
            setScanActionProduct(found);
            setShowScanner(false);
            return { ok: true, message: `✓ Найден: ${found.name}`, autoClose: true };
        }
        setMessage("Товар не найден по штрихкоду");
        return { ok: false, message: `✗ Не найден: ${code}`, autoClose: false };
    };
    if (mode === "revision") {
        // Просканированные сортируем по времени скана: последний — наверху.
        const scannedRows = rows
            .filter((row) => row.id in revisionFactual)
            .sort((a, b) => (revisionScanTime[b.id] ?? 0) - (revisionScanTime[a.id] ?? 0));
        const missingRows = rows.filter((row) => !(row.id in revisionFactual));
        const filteredMissingRows = revisionSearch.trim()
            ? missingRows.filter((r) => r.name.toLowerCase().includes(revisionSearch.trim().toLowerCase()))
            : missingRows;
        let surplus = 0;
        let shortage = 0;
        scannedRows.forEach((row) => {
            const actual = Number(revisionFactual[row.id] ?? 0);
            const diff = actual - row.balance;
            if (diff > 0)
                surplus += diff;
            else if (diff < 0)
                shortage += -diff;
        });
        missingRows.forEach((row) => {
            if (revisionMissing[row.id])
                shortage += row.balance;
        });
        const changesCount = Object.keys(revisionFactual).filter((idStr) => Number(revisionFactual[Number(idStr)]) !== (rows.find((r) => r.id === Number(idStr))?.balance ?? 0)).length + Object.values(revisionMissing).filter(Boolean).length;
        const addByBarcode = async (code) => {
            const found = await findProductByBarcode(code);
            if (!found)
                return { ok: false, message: `✗ Не найден: ${code}`, autoClose: false };
            const inRows = rows.find((r) => r.id === found.id);
            if (!inRows)
                return { ok: false, message: `Товар найден, но без остатка в каталоге`, autoClose: false };
            // Default factual = current balance + 1 (admin holds at least one item in hand).
            // Admin can edit it right after.
            setRevisionFactual((prev) => ({
                ...prev,
                [found.id]: prev[found.id] !== undefined ? prev[found.id] + 1 : 1,
            }));
            // Запоминаем время скана — нужно для сортировки «последние сверху».
            setRevisionScanTime((prev) => ({ ...prev, [found.id]: Date.now() }));
            // If product was marked missing — unmark it, since it's actually here.
            setRevisionMissing((prev) => {
                const next = { ...prev };
                delete next[found.id];
                return next;
            });
            return { ok: true, message: `✓ ${found.name}: ${(revisionFactual[found.id] ?? 0) + 1} шт`, autoClose: false };
        };
        return (_jsxs("main", { children: [message ? (_jsx("div", { className: `mb-3 rounded-xl px-4 py-3 text-sm text-white ${message.startsWith("✓") ? "bg-emerald-600" : "bg-slate-900"}`, children: message })) : null, _jsxs("div", { className: "mb-4 flex items-center justify-between", children: [_jsx("h1", { className: "text-3xl font-semibold", children: "\u0420\u0435\u0432\u0438\u0437\u0438\u044F \u0441\u043A\u043B\u0430\u0434\u0430" }), _jsx("button", { type: "button", className: "rounded-xl border px-4 py-2", onClick: () => {
                                if (revisionActive && changesCount > 0) {
                                    if (!window.confirm("Прервать текущую ревизию? Несохранённые сканы будут потеряны."))
                                        return;
                                }
                                setRevisionFactual({});
                                setRevisionScanTime({});
                                setRevisionMissing({});
                                setRevisionScannerOn(false);
                                setRevisionSearch("");
                                setRevisionShowMissing(false);
                                setRevisionActive(false);
                                setMode("stock");
                            }, children: "\u041D\u0430\u0437\u0430\u0434" })] }), !revisionActive ? (_jsx("div", { className: "mb-4", children: _jsx("button", { type: "button", className: "w-full rounded-xl bg-primary px-5 py-4 text-lg font-semibold text-white md:w-auto", onClick: () => setRevisionActive(true), children: "+ \u041D\u043E\u0432\u0430\u044F \u0440\u0435\u0432\u0438\u0437\u0438\u044F" }) })) : null, lastRevisionQuery.data?.found ? (_jsxs("div", { className: "mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold text-slate-700", children: "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F \u0440\u0435\u0432\u0438\u0437\u0438\u044F" }), _jsxs("p", { className: "text-xs text-slate-500", children: [lastRevisionQuery.data.completed_at
                                                    ? new Date(lastRevisionQuery.data.completed_at).toLocaleString()
                                                    : "—", lastRevisionQuery.data.by_user ? ` · ${lastRevisionQuery.data.by_user}` : ""] })] }), _jsxs("div", { className: "flex gap-3 text-sm", children: [_jsxs("span", { className: "text-emerald-700", children: ["+", lastRevisionQuery.data.surplus ?? 0] }), _jsxs("span", { className: "text-red-700", children: ["-", lastRevisionQuery.data.shortage ?? 0] }), _jsxs("span", { className: "text-slate-500", children: [lastRevisionQuery.data.items_count ?? 0, " \u043F\u043E\u0437."] })] })] }), _jsxs("div", { className: "mt-2 grid grid-cols-2 gap-2 text-xs", children: [_jsxs("div", { className: "rounded-lg border border-slate-200 bg-white p-2", children: [_jsx("div", { className: "text-slate-500", children: "\u041F\u043E \u0437\u0430\u043A\u0443\u043F\u043E\u0447\u043D\u043E\u0439 \u0446\u0435\u043D\u0435" }), _jsxs("div", { className: "mt-1 flex gap-2", children: [_jsxs("span", { className: "font-semibold text-emerald-700", children: ["+", moneyFmt(lastRevisionQuery.data.surplus_value_purchase ?? 0), " \u0441\u043E\u043C"] }), _jsxs("span", { className: "font-semibold text-red-700", children: ["\u2212", moneyFmt(lastRevisionQuery.data.shortage_value_purchase ?? 0), " \u0441\u043E\u043C"] })] })] }), _jsxs("div", { className: "rounded-lg border border-slate-200 bg-white p-2", children: [_jsx("div", { className: "text-slate-500", children: "\u041F\u043E \u043F\u0440\u043E\u0434\u0430\u0436\u043D\u043E\u0439 \u0446\u0435\u043D\u0435" }), _jsxs("div", { className: "mt-1 flex gap-2", children: [_jsxs("span", { className: "font-semibold text-emerald-700", children: ["+", moneyFmt(lastRevisionQuery.data.surplus_value_sale ?? 0), " \u0441\u043E\u043C"] }), _jsxs("span", { className: "font-semibold text-red-700", children: ["\u2212", moneyFmt(lastRevisionQuery.data.shortage_value_sale ?? 0), " \u0441\u043E\u043C"] })] })] })] }), lastRevisionQuery.data.items && lastRevisionQuery.data.items.length > 0 ? (_jsxs("details", { className: "mt-2", children: [_jsx("summary", { className: "cursor-pointer text-sm text-primary", children: "\u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0441\u043E\u0441\u0442\u0430\u0432" }), _jsx("div", { className: "mt-2 max-h-72 overflow-auto", children: _jsxs("table", { className: "min-w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b text-left text-xs text-slate-500", children: [_jsx("th", { className: "px-2 py-1", children: "\u0422\u043E\u0432\u0430\u0440" }), _jsx("th", { className: "px-2 py-1 text-right", children: "\u0421\u0438\u0441\u0442\u0435\u043C\u0430" }), _jsx("th", { className: "px-2 py-1 text-right", children: "\u0424\u0430\u043A\u0442" }), _jsx("th", { className: "px-2 py-1 text-right", children: "\u0420\u0430\u0437\u043D\u0438\u0446\u0430" }), _jsx("th", { className: "px-2 py-1 text-right", children: "\u0417\u0430\u043A\u0443\u043F. \u0446\u0435\u043D\u0430" }), _jsx("th", { className: "px-2 py-1 text-right", children: "\u0421\u0443\u043C\u043C\u0430 \u0437\u0430\u043A\u0443\u043F." }), _jsx("th", { className: "px-2 py-1 text-right", children: "\u041F\u0440\u043E\u0434\u0430\u0436. \u0446\u0435\u043D\u0430" }), _jsx("th", { className: "px-2 py-1 text-right", children: "\u0421\u0443\u043C\u043C\u0430 \u043F\u0440\u043E\u0434\u0430\u0436." })] }) }), _jsx("tbody", { children: lastRevisionQuery.data.items.map((it, idx) => (_jsxs("tr", { className: idx % 2 ? "bg-white" : "bg-slate-50", children: [_jsx("td", { className: "px-2 py-2", children: it.product_name || `#${it.product_id}` }), _jsx("td", { className: "px-2 py-2 text-right tabular-nums", children: it.expected_qty !== undefined && it.expected_qty !== null ? it.expected_qty : "—" }), _jsx("td", { className: "px-2 py-2 text-right tabular-nums", children: it.actual_qty !== undefined && it.actual_qty !== null ? it.actual_qty : "—" }), _jsx("td", { className: `px-2 py-2 text-right font-semibold tabular-nums ${it.delta > 0 ? "text-emerald-700" : "text-red-700"}`, children: it.delta > 0 ? `+${it.delta}` : `${it.delta}` }), _jsx("td", { className: "px-2 py-2 text-right tabular-nums text-slate-600", children: it.purchase_price ? moneyFmt(it.purchase_price) : "—" }), _jsx("td", { className: `px-2 py-2 text-right font-semibold tabular-nums ${(it.purchase_value ?? 0) > 0
                                                                ? "text-emerald-700"
                                                                : (it.purchase_value ?? 0) < 0
                                                                    ? "text-red-700"
                                                                    : "text-slate-500"}`, children: it.purchase_value != null
                                                                ? `${(it.purchase_value > 0 ? "+" : "")}${moneyFmt(it.purchase_value)}`
                                                                : "—" }), _jsx("td", { className: "px-2 py-2 text-right tabular-nums text-slate-600", children: it.sale_price ? moneyFmt(it.sale_price) : "—" }), _jsx("td", { className: `px-2 py-2 text-right font-semibold tabular-nums ${(it.sale_value ?? 0) > 0
                                                                ? "text-emerald-700"
                                                                : (it.sale_value ?? 0) < 0
                                                                    ? "text-red-700"
                                                                    : "text-slate-500"}`, children: it.sale_value != null
                                                                ? `${(it.sale_value > 0 ? "+" : "")}${moneyFmt(it.sale_value)}`
                                                                : "—" })] }, `${it.product_id}-${idx}`))) })] }) })] })) : null] })) : null, revisionActive ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mb-4 flex flex-col gap-2 rounded-2xl bg-white p-4 shadow md:flex-row", children: [_jsx("button", { type: "button", className: "rounded-xl bg-primary px-4 py-3 font-semibold text-white", onClick: () => {
                                        setScannerSession((s) => s + 1);
                                        setRevisionScannerOn(true);
                                    }, children: "\uD83D\uDCF7 \u0421\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0442\u043E\u0432\u0430\u0440" }), _jsx("input", { value: revisionSearch, onChange: (e) => setRevisionSearch(e.target.value), placeholder: "\u041F\u043E\u0438\u0441\u043A \u043F\u043E \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044E", className: "min-h-11 flex-1 rounded-xl border px-3 py-2" })] }), _jsxs("div", { className: "mb-4 rounded-2xl bg-white p-4 shadow", children: [_jsxs("h2", { className: "mb-2 text-lg font-semibold", children: ["\u041F\u0440\u043E\u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043E (", scannedRows.length, ")"] }), scannedRows.length === 0 ? (_jsx("p", { className: "text-sm text-slate-500", children: "\u041F\u043E\u043A\u0430 \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043E\u0442\u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043E. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u00AB\u0421\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0442\u043E\u0432\u0430\u0440\u00BB \u0438\u043B\u0438 \u043D\u0430\u0439\u0434\u0438\u0442\u0435 \u0432\u0440\u0443\u0447\u043D\u0443\u044E." })) : (_jsx("div", { className: "space-y-2", children: scannedRows.map((row) => {
                                        const actual = Number(revisionFactual[row.id] ?? 0);
                                        const diff = actual - row.balance;
                                        const bg = diff === 0 ? "bg-slate-50" : diff > 0 ? "bg-emerald-50" : "bg-red-50";
                                        return (_jsxs("div", { className: `grid grid-cols-1 gap-2 rounded-xl border p-3 md:grid-cols-5 ${bg}`, children: [_jsx("p", { className: "font-medium md:col-span-2", children: row.name }), _jsxs("p", { className: "text-sm", children: ["\u0421\u0438\u0441\u0442\u0435\u043C\u0430: ", _jsx("b", { children: row.balance })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-sm", children: "\u0424\u0430\u043A\u0442:" }), _jsx(NumberInput, { className: "h-9 w-20 rounded-lg border px-2 text-right", value: String(actual), onChange: (value) => setRevisionFactual((prev) => ({ ...prev, [row.id]: Math.max(0, Math.floor(Number(value) || 0)) })) }), _jsx("button", { type: "button", className: "text-sm text-red-600", onClick: () => {
                                                                setRevisionFactual((prev) => {
                                                                    const next = { ...prev };
                                                                    delete next[row.id];
                                                                    return next;
                                                                });
                                                                setRevisionScanTime((prev) => {
                                                                    const next = { ...prev };
                                                                    delete next[row.id];
                                                                    return next;
                                                                });
                                                            }, title: "\u0423\u0431\u0440\u0430\u0442\u044C \u0438\u0437 \u0440\u0435\u0432\u0438\u0437\u0438\u0438 (\u0432\u0435\u0440\u043D\u0451\u0442 \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u043A\u0430\u043A \u0431\u044B\u043B)", children: "\u2715" })] }), _jsx("p", { className: `text-sm font-semibold ${diff === 0 ? "text-slate-500" : diff > 0 ? "text-emerald-700" : "text-red-700"}`, children: diff === 0 ? "OK" : diff > 0 ? `+${diff}` : `${diff}` })] }, row.id));
                                    }) }))] }), _jsxs("div", { className: "mb-4 rounded-2xl bg-white p-4 shadow", children: [_jsxs("button", { type: "button", className: "flex w-full items-center justify-between text-left", onClick: () => setRevisionShowMissing((v) => !v), children: [_jsxs("h2", { className: "text-lg font-semibold", children: ["\u041D\u0435 \u043F\u0440\u043E\u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043E (", missingRows.length, ")"] }), _jsx("span", { className: "text-sm text-slate-500", children: revisionShowMissing ? "скрыть" : "показать" })] }), revisionShowMissing ? (_jsxs(_Fragment, { children: [_jsxs("p", { className: "mt-2 text-sm text-slate-500", children: ["\u041F\u043E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0433\u0430\u043B\u043E\u0447\u043A\u0443 ", _jsx("b", { children: "\u00AB\u042D\u0442\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0430\u0447\u0430\u00BB" }), " \u0442\u0430\u043C, \u0433\u0434\u0435 \u0442\u043E\u0432\u0430\u0440\u0430 \u0444\u0438\u0437\u0438\u0447\u0435\u0441\u043A\u0438 \u043D\u0435\u0442 (\u0441\u043F\u0438\u0441\u0430\u0442\u044C \u0432 0). \u0411\u0435\u0437 \u0433\u0430\u043B\u043E\u0447\u043A\u0438 \u0442\u043E\u0432\u0430\u0440 \u043E\u0441\u0442\u0430\u043D\u0435\u0442\u0441\u044F \u043A\u0430\u043A \u0435\u0441\u0442\u044C (\u0441\u0447\u0438\u0442\u0430\u0435\u043C \u0447\u0442\u043E \u0437\u0430\u0431\u044B\u043B\u0438 \u043F\u0440\u043E\u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u0442\u044C)."] }), _jsxs("div", { className: "mt-3 space-y-1", children: [filteredMissingRows.map((row) => {
                                                    const isMissing = !!revisionMissing[row.id];
                                                    return (_jsxs("label", { className: `flex items-center justify-between gap-3 rounded-lg border p-2 ${isMissing ? "bg-red-50 border-red-200" : ""}`, children: [_jsxs("div", { className: "flex-1", children: [_jsx("p", { className: "text-sm font-medium", children: row.name }), _jsxs("p", { className: "text-xs text-slate-500", children: ["\u0421\u0438\u0441\u0442\u0435\u043C\u0430: ", row.balance, " \u0448\u0442"] })] }), _jsxs("span", { className: "flex items-center gap-2 text-sm", children: [_jsx("input", { type: "checkbox", checked: isMissing, onChange: (e) => setRevisionMissing((prev) => ({ ...prev, [row.id]: e.target.checked })) }), "\u042D\u0442\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0430\u0447\u0430"] })] }, row.id));
                                                }), filteredMissingRows.length === 0 ? (_jsx("p", { className: "text-sm text-slate-500", children: "\u0412\u0441\u0435 \u0442\u043E\u0432\u0430\u0440\u044B \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u044B \u0438\u043B\u0438 \u043D\u0435 \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0442 \u043F\u043E\u0434 \u0444\u0438\u043B\u044C\u0442\u0440." })) : null] })] })) : null] }), _jsx("button", { type: "button", disabled: finishRevisionMutation.isPending || changesCount === 0, className: "w-full rounded-xl bg-success px-5 py-3 text-lg font-semibold text-white disabled:opacity-50 md:w-auto", onClick: () => finishRevisionMutation.mutate(), children: finishRevisionMutation.isPending ? "Сохранение…" : `Завершить ревизию${changesCount ? ` (${changesCount})` : ""}` }), revisionScannerOn ? (_jsx(BarcodeScanner, { onDetected: addByBarcode, onClose: () => setRevisionScannerOn(false) })) : null] })) : null] }));
    }
    return (_jsxs("main", { children: [message ? (_jsx("div", { className: `mb-3 rounded-xl px-4 py-3 text-sm text-white ${message.startsWith("✓") ? "bg-emerald-600" : "bg-slate-900"}`, children: message })) : null, _jsxs("div", { className: "mb-4 flex flex-col gap-2 rounded-2xl bg-white p-4 shadow md:flex-row md:flex-wrap md:items-stretch", children: [_jsx("input", { value: search, onChange: (e) => setSearch(e.target.value), placeholder: "\u041F\u043E\u0438\u0441\u043A \u043F\u043E \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044E \u0442\u043E\u0432\u0430\u0440\u0430", className: "min-h-11 min-w-0 w-full flex-1 rounded-xl border px-3 py-2 md:min-w-[12rem]" }), _jsx("button", { type: "button", className: `${stockToolbarBtn} bg-primary text-white`, onClick: () => openInModal(), children: "\u041F\u0440\u0438\u0445\u043E\u0434" }), _jsx("button", { type: "button", className: `${stockToolbarBtn} border border-primary text-primary`, onClick: () => openInModal(undefined, { newProductOnly: true }), children: "\u041D\u043E\u0432\u044B\u0439 \u0442\u043E\u0432\u0430\u0440" }), _jsx("button", { type: "button", className: `${stockToolbarBtn} border`, onClick: () => openOutModal(), children: "\u0420\u0430\u0441\u0445\u043E\u0434 / \u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435" }), _jsx("button", { type: "button", className: `${stockToolbarBtn} border`, onClick: () => setMode("revision"), children: "\u0420\u0435\u0432\u0438\u0437\u0438\u044F" }), _jsx("button", { type: "button", className: `${stockToolbarBtn} border`, onClick: () => setShowReturnModal(true), children: "\u0412\u043E\u0437\u0432\u0440\u0430\u0442" }), _jsx("button", { type: "button", className: `${stockToolbarBtn} border`, onClick: () => {
                            setScanContext("header");
                            setScannerSession((s) => s + 1);
                            setShowScanner(true);
                        }, children: "\u0421\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u0442\u044C" }), _jsx("button", { type: "button", className: `${stockToolbarBtn} ${barcodeSelectMode ? "bg-amber-500 text-white" : "border"}`, onClick: () => {
                            setBarcodeSelectMode((v) => !v);
                            setSelectedForBarcode(new Set());
                        }, children: barcodeSelectMode ? "Отменить выбор" : "Печать штрихкодов" }), barcodeSelectMode && selectedForBarcode.size > 0 ? (_jsxs("button", { type: "button", className: `${stockToolbarBtn} bg-success text-white`, onClick: () => void printBarcodesBatch(Array.from(selectedForBarcode)), children: ["\uD83D\uDDA8 \u0420\u0430\u0441\u043F\u0435\u0447\u0430\u0442\u0430\u0442\u044C (", selectedForBarcode.size, ")"] })) : null] }), hasExpiryDate && expiringSoonCount > 0 ? (_jsxs("button", { type: "button", onClick: () => setExpiringOnly((v) => !v), className: `mb-3 block w-full rounded-xl px-4 py-2 text-left text-sm ${expiringOnly ? "bg-amber-200 text-amber-900" : "bg-amber-50 text-amber-800 hover:bg-amber-100"}`, children: ["\u26A0\uFE0F ", expiringSoonCount, " ", expiringSoonCount === 1 ? "товар истекает" : "товара(-ов) истекают", " \u0432 \u0431\u043B\u0438\u0436\u0430\u0439\u0448\u0438\u0435 3 \u0434\u043D\u044F", expiringOnly ? " — фильтр включён (нажмите чтобы выключить)" : " — нажмите чтобы показать только их"] })) : null, _jsx("div", { className: "rounded-2xl bg-white p-4 shadow", children: _jsx("div", { className: "overflow-auto", children: _jsxs("table", { className: "min-w-full text-left text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b text-slate-500", children: [barcodeSelectMode ? (_jsx("th", { className: "px-2 py-2", children: _jsx("input", { type: "checkbox", checked: rows.length > 0 && rows.every((r) => selectedForBarcode.has(r.id)), onChange: (e) => {
                                                    if (e.target.checked)
                                                        setSelectedForBarcode(new Set(rows.map((r) => r.id)));
                                                    else
                                                        setSelectedForBarcode(new Set());
                                                } }) })) : null, _jsx("th", { className: "px-2 py-2", children: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435" }), _jsx("th", { className: "px-2 py-2", children: "\u0428\u0442\u0440\u0438\u0445\u043A\u043E\u0434" }), isGrocery ? _jsx("th", { className: "px-2 py-2", children: "\u041F\u043E\u0441\u0442\u0430\u0432\u0449\u0438\u043A" }) : null, _jsx("th", { className: "px-2 py-2", children: "\u041E\u0441\u0442\u0430\u0442\u043E\u043A" }), _jsx("th", { className: "px-2 py-2", children: "\u041C\u0438\u043D.\u043E\u0441\u0442\u0430\u0442\u043E\u043A" }), hasExpiryDate ? _jsx("th", { className: "px-2 py-2", children: "\u0421\u0440\u043E\u043A" }) : null, isOwner ? _jsx("th", { className: "px-2 py-2", children: "\u0426\u0435\u043D\u0430 \u0437\u0430\u043A\u0443\u043F\u043A\u0438" }) : null, _jsx("th", { className: "px-2 py-2", children: "\u0426\u0435\u043D\u0430 \u043F\u0440\u043E\u0434\u0430\u0436\u0438" }), isOwner ? _jsx("th", { className: "px-2 py-2", children: "\u041C\u0430\u0440\u0436\u0430 %" }) : null, _jsx("th", { className: "px-2 py-2", children: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" })] }) }), _jsx("tbody", { children: rows.map((row) => {
                                    const low = row.balance < row.min_stock;
                                    const equal = row.balance === row.min_stock;
                                    const checked = selectedForBarcode.has(row.id);
                                    const expiry = hasExpiryDate ? expiryInfo(row.id) : null;
                                    return (_jsxs("tr", { className: `cursor-pointer border-b ${low ? "bg-red-50" : equal ? "bg-yellow-50" : ""}`, onClick: () => {
                                            if (barcodeSelectMode) {
                                                setSelectedForBarcode((prev) => {
                                                    const next = new Set(prev);
                                                    if (next.has(row.id))
                                                        next.delete(row.id);
                                                    else
                                                        next.add(row.id);
                                                    return next;
                                                });
                                            }
                                            else {
                                                openProductCard(row);
                                            }
                                        }, children: [barcodeSelectMode ? (_jsx("td", { className: "px-2 py-2", onClick: (e) => e.stopPropagation(), children: _jsx("input", { type: "checkbox", checked: checked, onChange: (e) => {
                                                        setSelectedForBarcode((prev) => {
                                                            const next = new Set(prev);
                                                            if (e.target.checked)
                                                                next.add(row.id);
                                                            else
                                                                next.delete(row.id);
                                                            return next;
                                                        });
                                                    } }) })) : null, _jsx("td", { className: "px-2 py-2 font-medium", children: row.name }), _jsx("td", { className: "px-2 py-2 font-mono text-xs", children: row.barcode || "-" }), isGrocery ? (_jsx("td", { className: "px-2 py-2 text-sm text-slate-700", children: (() => {
                                                    const prod = products.find((p) => p.id === row.id);
                                                    const sup = (suppliersQuery.data ?? []).find((s) => s.id === (prod?.supplier_id ?? -1));
                                                    return sup ? sup.name : _jsx("span", { className: "text-slate-400", children: "\u2014" });
                                                })() })) : null, _jsx("td", { className: "px-2 py-2 font-semibold", children: row.balance }), _jsx("td", { className: "px-2 py-2", children: row.min_stock }), hasExpiryDate ? (_jsx("td", { className: "px-2 py-2", children: expiry ? (_jsx("span", { className: `rounded-full px-2 py-1 text-xs ${expiry.classes}`, children: expiry.label })) : (_jsx("span", { className: "text-xs text-slate-400", children: "\u2014" })) })) : null, isOwner ? _jsx("td", { className: "px-2 py-2", children: Number(row.purchase_price || 0).toFixed(2) }) : null, _jsx("td", { className: "px-2 py-2", children: Number(row.sale_price || 0).toFixed(2) }), isOwner ? (_jsx("td", { className: "px-2 py-2", children: row.margin_pct != null ? (_jsxs("span", { className: row.margin_pct >= 30 ? "text-emerald-700 font-semibold" :
                                                        row.margin_pct >= 10 ? "text-slate-700" :
                                                            row.margin_pct >= 0 ? "text-amber-700" :
                                                                "text-rose-700 font-semibold", children: [row.margin_pct.toFixed(1), "%"] })) : (_jsx("span", { className: "text-xs text-slate-400", children: "\u2014" })) })) : null, _jsx("td", { className: "px-2 py-2", children: _jsxs("div", { className: "flex gap-2", onClick: (e) => e.stopPropagation(), children: [_jsx("button", { className: "rounded-md border px-2 py-1", onClick: () => openInModal(row.id), children: "\u041F\u0440\u0438\u0445\u043E\u0434" }), _jsx("button", { className: "rounded-md border px-2 py-1", onClick: () => openOutModal(row.id), children: "\u0420\u0430\u0441\u0445\u043E\u0434" }), _jsx("button", { className: "rounded-md border px-2 py-1", onClick: () => printBarcode(row), children: "\u0428\u0442\u0440\u0438\u0445\u043A\u043E\u0434" })] }) })] }, row.id));
                                }) })] }) }) }), _jsxs("section", { className: "mt-5 rounded-2xl bg-white p-4 shadow", children: [_jsxs("div", { className: "mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between", children: [_jsxs("h2", { className: "text-xl font-semibold", children: ["\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u0439 (\u0432\u0441\u0435\u0433\u043E ", allFilteredMovements.length, ")"] }), _jsxs("select", { className: "h-10 rounded-lg border px-3", value: movementFilter, onChange: (e) => {
                                    setMovementFilter(e.target.value);
                                    setMovementsPage(1);
                                }, children: [_jsx("option", { value: "", children: "\u0412\u0441\u0435 \u0442\u0438\u043F\u044B" }), _jsx("option", { value: "in", children: "\u041F\u0440\u0438\u0445\u043E\u0434/\u0412\u043E\u0437\u0432\u0440\u0430\u0442" }), _jsx("option", { value: "out", children: "\u0420\u0430\u0441\u0445\u043E\u0434" }), _jsx("option", { value: "writeoff", children: "\u0421\u043F\u0438\u0441\u0430\u043D\u0438\u0435" })] })] }), _jsx("div", { className: "overflow-auto", children: _jsxs("table", { className: "min-w-full text-left text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b text-slate-500", children: [_jsx("th", { className: "px-2 py-2", children: "\u0414\u0430\u0442\u0430" }), _jsx("th", { className: "px-2 py-2", children: "\u0422\u043E\u0432\u0430\u0440" }), _jsx("th", { className: "px-2 py-2", children: "\u0422\u0438\u043F" }), _jsx("th", { className: "px-2 py-2", children: "\u041A\u043E\u043B-\u0432\u043E" }), _jsx("th", { className: "px-2 py-2", children: "\u041A\u0442\u043E \u0441\u0434\u0435\u043B\u0430\u043B" }), canEditMovements ? _jsx("th", { className: "px-2 py-2", children: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }) : null] }) }), _jsx("tbody", { children: filteredMovements.map((m) => {
                                        const p = products.find((x) => x.id === m.product_id);
                                        return (_jsxs("tr", { className: "border-b", children: [_jsx("td", { className: "px-2 py-2", children: m.created_at ? new Date(m.created_at).toLocaleString() : "-" }), _jsx("td", { className: "px-2 py-2", children: p?.name || `#${m.product_id}` }), _jsx("td", { className: "px-2 py-2", children: _jsx("span", { className: `rounded-full px-2 py-0.5 text-xs ${m.type === "in"
                                                            ? "bg-emerald-100 text-emerald-700"
                                                            : m.type === "writeoff"
                                                                ? "bg-amber-100 text-amber-700"
                                                                : "bg-red-100 text-red-700"}`, children: MOVEMENT_TYPE_LABEL[m.type] ?? m.type }) }), _jsx("td", { className: "px-2 py-2", children: m.quantity }), _jsx("td", { className: "px-2 py-2", children: m.created_by_name || "-" }), canEditMovements ? (_jsx("td", { className: "px-2 py-2", children: _jsxs("div", { className: "flex gap-1", children: [_jsx("button", { type: "button", onClick: () => {
                                                                    setEditingMovement(m);
                                                                    setEditMovementQty(String(m.quantity ?? ""));
                                                                    setEditMovementCost(m.cost_price != null ? String(m.cost_price) : "");
                                                                    setEditMovementReason(m.reason ?? "");
                                                                }, className: "rounded border border-slate-200 px-2 py-1 text-xs hover:border-primary hover:text-primary", title: "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u0435", children: "\u270F\uFE0F" }), _jsx("button", { type: "button", onClick: () => {
                                                                    if (window.confirm(`Удалить ${MOVEMENT_TYPE_LABEL[m.type] ?? m.type} #${m.id} (${p?.name ?? ""}, ${m.quantity})?\nОстаток автоматически пересчитается.`)) {
                                                                        deleteMovementMutation.mutate(m.id);
                                                                    }
                                                                }, className: "rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600", title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u0435 (\u043E\u0442\u043A\u0430\u0442\u0438\u0442 \u043E\u0441\u0442\u0430\u0442\u043E\u043A)", children: "\uD83D\uDDD1" })] }) })) : null] }, m.id));
                                    }) })] }) }), movementsTotalPages > 1 ? (_jsxs("div", { className: "mt-3 flex items-center justify-end gap-2", children: [_jsx("button", { type: "button", className: "rounded-lg border px-3 py-1 text-sm disabled:opacity-50", disabled: currentMovementsPage <= 1, onClick: () => setMovementsPage((p) => Math.max(1, p - 1)), children: "\u041D\u0430\u0437\u0430\u0434" }), _jsxs("span", { className: "text-sm text-slate-600", children: [currentMovementsPage, " / ", movementsTotalPages] }), _jsx("button", { type: "button", className: "rounded-lg border px-3 py-1 text-sm disabled:opacity-50", disabled: currentMovementsPage >= movementsTotalPages, onClick: () => setMovementsPage((p) => Math.min(movementsTotalPages, p + 1)), children: "\u0412\u043F\u0435\u0440\u0451\u0434" })] })) : null] }), selectedProduct ? (_jsxs("div", { className: "fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-auto border-l bg-white p-5 shadow-2xl", children: [_jsxs("div", { className: "mb-4 flex items-center justify-between", children: [_jsx("h3", { className: "text-2xl font-semibold", children: selectedProduct.name }), _jsx("button", { className: "rounded-lg border px-3 py-1", onClick: () => setSelectedProduct(null), children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })] }), _jsxs("div", { className: "space-y-2 text-sm", children: [_jsxs("p", { children: [_jsx("b", { children: "\u0428\u0442\u0440\u0438\u0445\u043A\u043E\u0434:" }), " ", selectedProduct.barcode || "Нет"] }), _jsxs("p", { children: [_jsx("b", { children: "\u041C\u0438\u043D. \u043E\u0441\u0442\u0430\u0442\u043E\u043A:" }), " ", selectedProduct.min_stock ?? 0] }), _jsxs("p", { children: [_jsx("b", { children: "\u0426\u0435\u043D\u0430 \u043F\u0440\u043E\u0434\u0430\u0436\u0438:" }), " ", Number(selectedProduct.sale_price || 0).toFixed(2)] }), isOwner ? _jsxs("p", { children: [_jsx("b", { children: "\u0426\u0435\u043D\u0430 \u0437\u0430\u043A\u0443\u043F\u043A\u0438:" }), " ", Number(selectedProduct.purchase_price || 0).toFixed(2)] }) : null, _jsxs("p", { children: [_jsx("b", { children: "\u0413\u0430\u0440\u0430\u043D\u0442\u0438\u044F:" }), " ", selectedProduct.warranty_months ?? 0, " \u043C\u0435\u0441."] }), _jsxs("p", { children: [_jsx("b", { children: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435:" }), " ", selectedProduct.description || "-"] })] }), _jsxs("div", { className: "mt-5 rounded-xl border p-3", children: [_jsx("h4", { className: "mb-2 font-semibold", children: "\u0428\u0442\u0440\u0438\u0445\u043A\u043E\u0434" }), selectedProduct.barcode ? (_jsxs("div", { className: "space-y-2", children: [barcodePreviewLoading ? (_jsx("p", { className: "text-sm text-slate-500", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434\u0430\u2026" })) : barcodePreviewUrl ? (_jsx("img", { src: barcodePreviewUrl, alt: "barcode", className: "max-h-24 w-full rounded bg-white object-contain" })) : (_jsx("p", { className: "text-sm text-red-600", children: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434" })), _jsx("button", { type: "button", className: "rounded-lg bg-primary px-3 py-2 text-white disabled:opacity-50", disabled: barcodePreviewLoading || !barcodePreviewUrl, onClick: () => void printBarcode(selectedProduct), children: "\u0420\u0430\u0441\u043F\u0435\u0447\u0430\u0442\u0430\u0442\u044C \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434" })] })) : (_jsx("button", { className: "rounded-lg bg-primary px-3 py-2 text-white", onClick: () => generateBarcodeMutation.mutate(selectedProduct.id), children: "\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434" }))] }), _jsxs("div", { className: "mt-5 rounded-xl border p-3", children: [_jsx("h4", { className: "mb-2 font-semibold", children: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0434\u0432\u0438\u0436\u0435\u043D\u0438\u0439 (10)" }), _jsxs("div", { className: "space-y-2 text-sm", children: [selectedProductMovements.map((m) => (_jsxs("div", { className: "rounded-lg border p-2", children: [_jsxs("p", { children: [MOVEMENT_TYPE_LABEL[m.type] ?? m.type, " \u00B7 ", m.quantity] }), _jsx("p", { className: "text-xs text-slate-500", children: m.created_at ? new Date(m.created_at).toLocaleString() : "-" })] }, m.id))), !selectedProductMovements.length ? _jsx("p", { className: "text-slate-500", children: "\u0414\u0432\u0438\u0436\u0435\u043D\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B" }) : null] })] }), _jsx("button", { className: "mt-5 rounded-xl border px-4 py-2", children: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0442\u043E\u0432\u0430\u0440" })] })) : null, showInModal ? (_jsx("div", { className: modalOverlay, children: _jsxs("div", { className: modalCard, children: [_jsx("h3", { className: "mb-4 text-xl font-semibold", children: inReceiptMode === "create" ? "Новый товар и приход" : "Приход товара" }), inReceiptMode === "create" ? (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "mb-3 text-sm font-medium text-primary hover:underline", onClick: () => {
                                        setInReceiptMode("existing");
                                        setInModalError("");
                                    }, children: "\u2190 \u041A \u043F\u043E\u0438\u0441\u043A\u0443 \u0442\u043E\u0432\u0430\u0440\u0430" }), _jsx("p", { className: "mb-2 text-sm font-semibold text-slate-800", children: "\u041D\u043E\u0432\u044B\u0439 \u0442\u043E\u0432\u0430\u0440" }), _jsxs("div", { className: "mb-4 grid grid-cols-1 gap-3 md:grid-cols-2", children: [_jsxs("div", { className: "md:col-span-2", children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435" }), _jsx("input", { className: "w-full rounded-lg border px-3 py-2", value: newProductName, onChange: (e) => setNewProductName(e.target.value), placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435" })] }), !isGrocery ? (_jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0413\u0430\u0440\u0430\u043D\u0442\u0438\u044F (\u043C\u0435\u0441.)" }), _jsx(NumberInput, { className: "w-full rounded-lg border px-3 py-2", value: newProductWarranty, onChange: setNewProductWarranty })] })) : null, _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u041C\u0438\u043D\u0438\u043C\u0430\u043B\u044C\u043D\u044B\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A" }), _jsx(NumberInput, { className: "w-full rounded-lg border px-3 py-2", value: newProductMinStock, onChange: setNewProductMinStock })] }), _jsxs("div", { className: "md:col-span-2", children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0428\u0442\u0440\u0438\u0445\u043A\u043E\u0434" }), _jsxs("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-stretch", children: [_jsx("input", { className: "w-full flex-1 rounded-lg border px-3 py-2 font-mono sm:min-w-0", disabled: useAutoBarcode, value: useAutoBarcode ? "" : newCardBarcode, onChange: (e) => {
                                                                setNewCardBarcode(e.target.value);
                                                                setUseAutoBarcode(false);
                                                            }, placeholder: useAutoBarcode ? "Будет сгенерирован при сохранении" : "Штрихкод" }), _jsx("button", { type: "button", className: "shrink-0 rounded-lg border border-primary px-3 py-2 text-sm text-primary", onClick: () => {
                                                                setUseAutoBarcode(true);
                                                                setNewCardBarcode("");
                                                            }, children: "\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438" })] })] }), isGrocery ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "md:col-span-2", children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F" }), _jsx("input", { className: "w-full rounded-lg border px-3 py-2", value: newProductCategory, onChange: (e) => setNewProductCategory(e.target.value), placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, \u041C\u043E\u043B\u043E\u0447\u043D\u044B\u0435 \u043F\u0440\u043E\u0434\u0443\u043A\u0442\u044B" })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0422\u0438\u043F \u0442\u043E\u0432\u0430\u0440\u0430" }), _jsxs("select", { className: "w-full rounded-lg border bg-white px-3 py-2", value: newProductKind, onChange: (e) => {
                                                                const k = e.target.value;
                                                                setNewProductKind(k);
                                                                setNewProductUnit(k === "piece" ? "шт" : k === "weighed" ? "кг" : "л");
                                                            }, children: [_jsx("option", { value: "piece", children: "\u0428\u0442\u0443\u0447\u043D\u044B\u0439" }), _jsx("option", { value: "weighed", children: "\u0412\u0435\u0441\u043E\u0432\u043E\u0439" }), _jsx("option", { value: "volume", children: "\u041E\u0431\u044A\u0451\u043C\u043D\u044B\u0439" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0415\u0434\u0438\u043D\u0438\u0446\u0430" }), _jsx("select", { className: "w-full rounded-lg border bg-white px-3 py-2", value: newProductUnit, onChange: (e) => setNewProductUnit(e.target.value), children: ["шт", "кг", "г", "л", "мл", "уп", "пачка", "рул"].map((u) => (_jsx("option", { value: u, children: u }, u))) })] }), newProductKind === "weighed" ? (_jsxs("div", { className: "md:col-span-2", children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "PLU / \u041A\u043E\u0434 \u0432\u0435\u0441\u043E\u0432" }), _jsx("input", { className: "w-full rounded-lg border px-3 py-2 font-mono", value: newProductPlu, onChange: (e) => setNewProductPlu(e.target.value), inputMode: "numeric", pattern: "\\d+", placeholder: "12345" })] })) : null, _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0421\u0440\u043E\u043A \u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F (\u0434\u043D\u0435\u0439)" }), _jsx(NumberInput, { className: "w-full rounded-lg border px-3 py-2", value: newProductShelfLife, onChange: setNewProductShelfLife })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0422\u0435\u043C\u043F\u0435\u0440\u0430\u0442\u0443\u0440\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C" }), _jsxs("select", { className: "w-full rounded-lg border bg-white px-3 py-2", value: newProductStorageTemp, onChange: (e) => setNewProductStorageTemp(e.target.value), children: [_jsx("option", { value: "", children: "\u2014 \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D \u2014" }), _jsx("option", { value: "ambient", children: "\u041A\u043E\u043C\u043D\u0430\u0442\u043D\u0430\u044F (15-25\u00B0C)" }), _jsx("option", { value: "cool", children: "\u041F\u0440\u043E\u0445\u043B\u0430\u0434\u043D\u043E\u0435 \u043C\u0435\u0441\u0442\u043E" }), _jsx("option", { value: "refrigerated", children: "\u0425\u043E\u043B\u043E\u0434\u0438\u043B\u044C\u043D\u0438\u043A (+2..+8\u00B0C)" }), _jsx("option", { value: "frozen", children: "\u0417\u0430\u043C\u043E\u0440\u043E\u0437\u043A\u0430 (-18\u00B0C)" })] })] }), _jsxs("div", { className: "md:col-span-2", children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u041F\u043E\u0441\u0442\u0430\u0432\u0449\u0438\u043A" }), _jsx("input", { className: "w-full rounded-lg border px-3 py-2", list: "stock-newproduct-suppliers", value: newProductManufacturer, onChange: (e) => setNewProductManufacturer(e.target.value), placeholder: "\u041D\u0430\u0447\u043D\u0438 \u0432\u0432\u043E\u0434\u0438\u0442\u044C \u0438\u043C\u044F \u043F\u043E\u0441\u0442\u0430\u0432\u0449\u0438\u043A\u0430\u2026" }), _jsx("datalist", { id: "stock-newproduct-suppliers", children: (suppliersQuery.data ?? []).map((s) => (_jsx("option", { value: s.name }, s.id))) }), _jsx("p", { className: "mt-1 text-xs text-slate-500", children: "\u0415\u0441\u043B\u0438 \u0442\u0430\u043A\u043E\u0433\u043E \u043F\u043E\u0441\u0442\u0430\u0432\u0449\u0438\u043A\u0430 \u043D\u0435\u0442 \u2014 \u0434\u043E\u0431\u0430\u0432\u044C \u0435\u0433\u043E \u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u0435 \u00AB\u041F\u043E\u0441\u0442\u0430\u0432\u0449\u0438\u043A\u0438\u00BB, \u0438\u043D\u0430\u0447\u0435 \u043E\u043D \u043F\u0440\u043E\u0441\u0442\u043E \u043D\u0435 \u043F\u0440\u0438\u0432\u044F\u0436\u0435\u0442\u0441\u044F \u043A \u0442\u043E\u0432\u0430\u0440\u0443." })] })] })) : null] }), _jsx("p", { className: "mb-2 text-sm font-semibold text-slate-800", children: "\u041F\u0440\u0438\u0445\u043E\u0434" }), _jsxs("div", { className: "grid grid-cols-1 gap-3 md:grid-cols-2", children: [_jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E" }), _jsxs("div", { className: `flex items-center gap-2 rounded-lg border px-2 py-2 ${inQtyInvalid ? "border-red-500" : ""}`, children: [_jsx("button", { type: "button", className: "h-9 w-9 rounded-md border", onClick: () => setQty(String(Math.max(1, Number(qty || 1) - 1))), children: "\u2212" }), _jsx(NumberInput, { className: "w-full border-0 text-center text-2xl outline-none", value: qty, onChange: (value) => {
                                                                const next = Math.min(9999, Math.max(1, Number(value || 1)));
                                                                setQty(String(next));
                                                            }, placeholder: "1" }), _jsx("button", { type: "button", className: "h-9 w-9 rounded-md border", onClick: () => setQty(String(Math.min(9999, Number(qty || 1) + 1))), children: "+" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0426\u0435\u043D\u0430 \u0437\u0430\u043A\u0443\u043F\u043A\u0438 (\u0437\u0430 \u0435\u0434.)" }), _jsx(NumberInput, { className: "w-full rounded-lg border px-3 py-2", value: purchasePrice, onChange: setPurchasePrice, placeholder: "\u0426\u0435\u043D\u0430 \u0437\u0430\u043A\u0443\u043F\u043A\u0438 (\u0437\u0430 \u0435\u0434.)" }), _jsxs("p", { className: "mt-2 text-sm font-medium text-slate-700", children: ["\u0418\u0442\u043E\u0433\u043E \u043A \u043E\u043F\u0440\u0438\u0445\u043E\u0434\u043E\u0432\u0430\u043D\u0438\u044E: ", incomingTotal.toFixed(2), " \u0441\u043E\u043C"] })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0420\u043E\u0437\u043D\u0438\u0447\u043D\u0430\u044F \u0446\u0435\u043D\u0430 (\u0437\u0430 \u0435\u0434.)" }), _jsx(NumberInput, { className: "w-full rounded-lg border px-3 py-2", value: retailPrice, onChange: setRetailPrice })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0414\u0430\u0442\u0430 \u043F\u0440\u0438\u0445\u043E\u0434\u0430" }), _jsx("input", { type: "date", className: "w-full rounded-lg border px-3 py-2", value: movementDate, onChange: (e) => setMovementDate(e.target.value) })] }), _jsxs("div", { className: "md:col-span-2", children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439" }), _jsx("input", { className: "w-full rounded-lg border px-3 py-2", value: comment, onChange: (e) => setComment(e.target.value), placeholder: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439" })] })] })] })) : (_jsxs("div", { className: "grid grid-cols-1 gap-3 md:grid-cols-2", children: [_jsxs("div", { className: "relative md:col-span-2", children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0422\u043E\u0432\u0430\u0440" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { value: inProductSearch, onChange: (e) => {
                                                        setInProductSearch(e.target.value);
                                                        setSelectedProductId("");
                                                        setInModalScanInfo(null);
                                                        setBarcodeMiss(null);
                                                    }, placeholder: "\u041F\u043E\u0438\u0441\u043A \u0442\u043E\u0432\u0430\u0440\u0430...", className: `h-11 flex-1 rounded-lg border px-3 py-2 ${inProductInvalid
                                                        ? "border-red-500"
                                                        : showNameMissOffer || showBarcodeMissOffer
                                                            ? "border-amber-300 bg-amber-50/40"
                                                            : ""}` }), _jsx("button", { className: "h-11 rounded-lg border px-3", onClick: () => {
                                                        if (isDesktop) {
                                                            setInManualMode(true);
                                                            return;
                                                        }
                                                        setInModalScanning(true);
                                                    }, children: "\u0421\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u0442\u044C" })] }), inManualMode ? (_jsxs("div", { className: "mt-2 flex gap-2", children: [_jsx("input", { value: inManualBarcode, onChange: (e) => setInManualBarcode(e.target.value), placeholder: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434 \u0432\u0440\u0443\u0447\u043D\u0443\u044E", className: "h-11 flex-1 rounded-lg border px-3 py-2" }), _jsx("button", { className: "rounded-lg border px-3", onClick: () => {
                                                        void (async () => {
                                                            const found = await findProductByBarcode(inManualBarcode.trim());
                                                            if (found) {
                                                                setSelectedProductId(found.id);
                                                                setInProductSearch(found.name);
                                                                setPurchasePrice(String(found.purchase_price ?? 0));
                                                                setRetailPrice(String(found.sale_price ?? 0));
                                                                setInModalScanInfo({ ok: true, text: `✓ Найден: ${found.name}` });
                                                            }
                                                            else {
                                                                setInModalScanInfo(null);
                                                                setBarcodeMiss(inManualBarcode.trim());
                                                            }
                                                        })();
                                                    }, children: "\u041D\u0430\u0439\u0442\u0438" })] })) : null, inModalScanning ? (_jsxs("div", { className: "mt-3 rounded-xl border p-2", children: [_jsx(BarcodeScanner, { embedded: true, onDetected: (code) => {
                                                        return (async () => {
                                                            const found = await findProductByBarcode(code);
                                                            if (found) {
                                                                setSelectedProductId(found.id);
                                                                setInProductSearch(found.name);
                                                                setPurchasePrice(String(found.purchase_price ?? 0));
                                                                setRetailPrice(String(found.sale_price ?? 0));
                                                                setInModalScanInfo({ ok: true, text: `✓ Найден: ${found.name}` });
                                                                setInModalScanning(false);
                                                                return { ok: true, message: `✓ Найден: ${found.name}`, autoClose: true };
                                                            }
                                                            setInReceiptMode("create");
                                                            setNewCardBarcode(code);
                                                            setUseAutoBarcode(false);
                                                            setNewProductName("");
                                                            setInModalScanInfo(null);
                                                            setBarcodeMiss(null);
                                                            setInModalScanning(false);
                                                            return { ok: false, message: `✗ Не найден: ${code}`, autoClose: true };
                                                        })();
                                                    }, onClose: () => setInModalScanning(false) }), _jsx("button", { className: "mt-2 w-full rounded-lg border px-3 py-2", onClick: () => setInModalScanning(false), children: "\u041E\u0442\u043C\u0435\u043D\u0430 \u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F" })] })) : null, showInProductDropdown ? (_jsx("div", { className: "absolute left-0 right-0 top-12 z-20 max-h-60 overflow-auto rounded-lg border bg-white shadow", children: (inModalProductsQuery.data ?? []).map((p) => (_jsxs("button", { type: "button", className: "flex w-full items-center justify-between border-b px-3 py-2 text-left last:border-b-0", onMouseDown: (e) => e.preventDefault(), onClick: () => {
                                                    setSelectedProductId(p.id);
                                                    setInProductSearch(p.name);
                                                    setPurchasePrice(formatMoneyFromApi(p.purchase_price));
                                                    setRetailPrice(formatMoneyFromApi(p.sale_price));
                                                    setInModalScanInfo({ ok: true, text: `✓ Найден: ${p.name}` });
                                                    setInModalError("");
                                                }, children: [_jsx("span", { children: p.name }), _jsxs("span", { className: "text-xs text-slate-500", children: ["\u041E\u0441\u0442\u0430\u0442\u043E\u043A: ", stockMap.get(p.id) ?? 0] })] }, p.id))) })) : null, inModalScanInfo?.ok ? (_jsxs("p", { className: "mt-2 text-sm text-emerald-600", children: [inModalScanInfo.text, selectedStockProduct?.weighing_code
                                                    ? ` · PLU: ${selectedStockProduct.weighing_code}`
                                                    : selectedStockProduct?.kind === "weighed"
                                                        ? " · PLU не задан"
                                                        : ""] })) : null, showBarcodeMissOffer ? (_jsxs("div", { className: "mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-slate-800", children: [_jsxs("p", { children: ["\u0422\u043E\u0432\u0430\u0440 \u0441\u043E \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434\u043E\u043C ", _jsx("span", { className: "font-mono font-semibold", children: barcodeMiss }), " \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0432 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0435."] }), _jsx("button", { type: "button", className: "mt-3 w-full rounded-lg bg-primary px-3 py-2.5 text-center text-sm text-white sm:w-auto", onClick: () => {
                                                        setInReceiptMode("create");
                                                        setNewCardBarcode(barcodeMiss ?? "");
                                                        setNewProductName("");
                                                        setUseAutoBarcode(false);
                                                        setBarcodeMiss(null);
                                                    }, children: "+ \u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043D\u043E\u0432\u044B\u0439 \u0442\u043E\u0432\u0430\u0440 \u0441 \u044D\u0442\u0438\u043C \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434\u043E\u043C \u0438 \u043E\u043F\u0440\u0438\u0445\u043E\u0434\u043E\u0432\u0430\u0442\u044C" })] })) : showNameMissOffer ? (_jsxs("div", { className: "mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-slate-800", children: [_jsxs("p", { children: ["\u0422\u043E\u0432\u0430\u0440 \u00AB", qSearch, "\u00BB \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0432 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0435."] }), _jsxs("button", { type: "button", className: "mt-3 w-full rounded-lg bg-primary px-3 py-2.5 text-center text-sm text-white sm:w-auto", onClick: () => {
                                                        setInReceiptMode("create");
                                                        setNewProductName(qSearch);
                                                        setNewCardBarcode("");
                                                        setUseAutoBarcode(false);
                                                    }, children: ["+ \u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043D\u043E\u0432\u044B\u0439 \u0442\u043E\u0432\u0430\u0440 \u00AB", qSearch, "\u00BB \u0438 \u043E\u043F\u0440\u0438\u0445\u043E\u0434\u043E\u0432\u0430\u0442\u044C"] })] })) : null] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E" }), _jsxs("div", { className: `flex items-center gap-2 rounded-lg border px-2 py-2 ${inQtyInvalid ? "border-red-500" : ""}`, children: [_jsx("button", { className: "h-9 w-9 rounded-md border", onClick: () => setQty(String(Math.max(1, Number(qty || 1) - 1))), children: "\u2212" }), _jsx(NumberInput, { className: "w-full border-0 text-center text-2xl outline-none", value: qty, onChange: (value) => {
                                                        const next = Math.min(9999, Math.max(1, Number(value || 1)));
                                                        setQty(String(next));
                                                    }, placeholder: "1" }), _jsx("button", { className: "h-9 w-9 rounded-md border", onClick: () => setQty(String(Math.min(9999, Number(qty || 1) + 1))), children: "+" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0426\u0435\u043D\u0430 \u0437\u0430\u043A\u0443\u043F\u043A\u0438 (\u0437\u0430 \u0435\u0434.)" }), _jsx(NumberInput, { className: "w-full rounded-lg border px-3 py-2", value: purchasePrice, onChange: setPurchasePrice, placeholder: "\u0426\u0435\u043D\u0430 \u0437\u0430\u043A\u0443\u043F\u043A\u0438 (\u0437\u0430 \u0435\u0434.)" }), _jsxs("p", { className: "mt-2 text-sm font-medium text-slate-700", children: ["\u0418\u0442\u043E\u0433\u043E \u043A \u043E\u043F\u0440\u0438\u0445\u043E\u0434\u043E\u0432\u0430\u043D\u0438\u044E: ", incomingTotal.toFixed(2), " \u0441\u043E\u043C"] })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0420\u043E\u0437\u043D\u0438\u0447\u043D\u0430\u044F \u0446\u0435\u043D\u0430 (\u0437\u0430 \u0435\u0434.)" }), _jsx(NumberInput, { className: "w-full rounded-lg border px-3 py-2", value: retailPrice, onChange: setRetailPrice })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0414\u0430\u0442\u0430 \u043F\u0440\u0438\u0445\u043E\u0434\u0430" }), _jsx("input", { type: "date", className: "w-full rounded-lg border px-3 py-2", value: movementDate, onChange: (e) => setMovementDate(e.target.value) })] }), _jsxs("div", { className: "md:col-span-2", children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439" }), _jsx("input", { className: "w-full rounded-lg border px-3 py-2", value: comment, onChange: (e) => setComment(e.target.value), placeholder: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439" })] }), isGrocery ? (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0414\u0430\u0442\u0430 \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0441\u0442\u0432\u0430" }), _jsx("input", { type: "date", className: "w-full rounded-lg border px-3 py-2", value: productionDate, onChange: (e) => {
                                                        const value = e.target.value;
                                                        setProductionDate(value);
                                                        const sel = products.find((p) => p.id === Number(selectedProductId));
                                                        if (value && sel?.shelf_life_days) {
                                                            const d = new Date(value + "T00:00:00");
                                                            d.setDate(d.getDate() + sel.shelf_life_days);
                                                            setExpiryDate(d.toISOString().slice(0, 10));
                                                        }
                                                    } })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0414\u0430\u0442\u0430 \u0438\u0441\u0442\u0435\u0447\u0435\u043D\u0438\u044F" }), _jsx("input", { type: "date", className: "w-full rounded-lg border px-3 py-2", value: expiryDate, onChange: (e) => setExpiryDate(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u041D\u043E\u043C\u0435\u0440 \u043F\u0430\u0440\u0442\u0438\u0438" }), _jsx("input", { className: "w-full rounded-lg border px-3 py-2", value: batchNumber, onChange: (e) => setBatchNumber(e.target.value), placeholder: "Batch #" })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u041F\u043E\u0441\u0442\u0430\u0432\u0449\u0438\u043A" }), _jsx("input", { className: "w-full rounded-lg border px-3 py-2", value: supplierIn, onChange: (e) => setSupplierIn(e.target.value), list: "suppliers-list", placeholder: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0438\u043B\u0438 \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u043E\u0432\u043E\u0433\u043E", onBlur: async () => {
                                                        const value = supplierIn.trim();
                                                        if (!value)
                                                            return;
                                                        const exists = (suppliersQuery.data ?? []).some((s) => s.name === value);
                                                        if (!exists && isOwner) {
                                                            try {
                                                                await api.post("/suppliers", { name: value });
                                                                await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
                                                            }
                                                            catch {
                                                                // тихо — не блокируем приход если не дали роль
                                                            }
                                                        }
                                                    } }), _jsx("datalist", { id: "suppliers-list", children: (suppliersQuery.data ?? []).map((s) => (_jsx("option", { value: s.name }, s.id))) })] })] })) : null] })), inModalError ? _jsx("div", { className: "mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700", children: inModalError }) : null, _jsxs("div", { className: "mt-4 flex gap-2", children: [inReceiptMode === "create" ? (_jsx("button", { type: "button", disabled: createProductAndReceiptMutation.isPending, className: "rounded-xl bg-primary px-4 py-2 text-white disabled:opacity-60", onClick: () => {
                                        setInFormTouched(true);
                                        if (!newProductName.trim()) {
                                            setInModalError("Укажите название товара");
                                            return;
                                        }
                                        if (!useAutoBarcode && !newCardBarcode.trim()) {
                                            setInModalError("Укажите штрихкод или нажмите «Сгенерировать автоматически»");
                                            return;
                                        }
                                        if (Number(qty) < 1 || Number(qty) > 9999) {
                                            setInModalError("Количество должно быть от 1 до 9999");
                                            return;
                                        }
                                        setInModalError("");
                                        createProductAndReceiptMutation.mutate();
                                    }, children: createProductAndReceiptMutation.isPending ? "Сохранение…" : "Сохранить" })) : (_jsx("button", { type: "button", disabled: movementMutation.isPending, className: "rounded-xl bg-primary px-4 py-2 text-white disabled:opacity-60", onClick: async () => {
                                        setInFormTouched(true);
                                        const resolvedId = resolveIncomingProductId();
                                        if (resolvedId) {
                                            setSelectedProductId(resolvedId);
                                        }
                                        const productId = resolvedId ?? (selectedProductId !== "" ? Number(selectedProductId) : NaN);
                                        if (!Number.isFinite(productId) || productId < 1 || Number(qty) < 1) {
                                            setInModalError("Выберите товар из списка или создайте новый товар по кнопке ниже. Количество должно быть от 1 до 9999.");
                                            setMessage("Выберите товар и укажите количество");
                                            return;
                                        }
                                        setInModalError("");
                                        const selected = products.find((p) => p.id === productId);
                                        const nextRetail = parseMoney(retailPrice);
                                        const currentRetail = parseMoney(String(selected?.sale_price ?? 0));
                                        if (selected && Math.abs(nextRetail - currentRetail) > 0.0001) {
                                            try {
                                                await api.put(`/products/${selected.id}`, { sale_price: nextRetail });
                                                await queryClient.invalidateQueries({ queryKey: ["products-all"] });
                                            }
                                            catch (error) {
                                                setInModalError(extractAxiosDetail(error));
                                                return;
                                            }
                                        }
                                        const supTrim = supplierIn.trim();
                                        const supId = supTrim
                                            ? (suppliersQuery.data ?? []).find((s) => s.name === supTrim)?.id ?? null
                                            : null;
                                        const isWeighed = selected?.kind === "weighed";
                                        const qtyNum = Number(qty);
                                        movementMutation.mutate({
                                            product_id: productId,
                                            quantity: isWeighed ? 0 : Math.min(9999, Math.max(1, Math.floor(qtyNum))),
                                            quantity_decimal: isWeighed ? Number(qtyNum.toFixed(3)) : null,
                                            type: "in",
                                            reason: comment.trim() || undefined,
                                            cost_price: parseMoney(purchasePrice) || null,
                                            ...(isGrocery
                                                ? {
                                                    production_date: productionDate || null,
                                                    expiry_date: expiryDate || null,
                                                    batch_number: batchNumber.trim() || null,
                                                    supplier: supTrim || null,
                                                    supplier_id: supId,
                                                }
                                                : {}),
                                        });
                                    }, children: movementMutation.isPending ? "Сохранение…" : "Сохранить" })), _jsx("button", { type: "button", className: "rounded-xl border px-4 py-2", onClick: () => setShowInModal(false), children: "\u041E\u0442\u043C\u0435\u043D\u0430" })] })] }) })) : null, showOutModal ? (_jsx("div", { className: modalOverlay, children: _jsxs("div", { className: modalCard, children: [_jsx("h3", { className: "mb-4 text-xl font-semibold", children: "\u0420\u0430\u0441\u0445\u043E\u0434 / \u0421\u043F\u0438\u0441\u0430\u043D\u0438\u0435" }), _jsxs("div", { className: "grid grid-cols-1 gap-3 md:grid-cols-2", children: [_jsxs("div", { className: "relative md:col-span-2", children: [_jsxs("div", { className: "flex gap-2", children: [_jsx("input", { className: "h-11 flex-1 rounded-lg border px-3 py-2", value: outProductSearch, onChange: (e) => {
                                                        setOutProductSearch(e.target.value);
                                                        setSelectedProductId("");
                                                    }, placeholder: "\u041F\u043E\u0438\u0441\u043A \u0442\u043E\u0432\u0430\u0440\u0430..." }), _jsx("button", { className: "h-11 rounded-lg border px-3", onClick: () => {
                                                        if (isDesktop) {
                                                            setOutManualMode(true);
                                                            return;
                                                        }
                                                        setOutModalScanning(true);
                                                    }, children: "\u0421\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u0442\u044C" })] }), outManualMode ? (_jsxs("div", { className: "mt-2 flex gap-2", children: [_jsx("input", { value: outManualBarcode, onChange: (e) => setOutManualBarcode(e.target.value), placeholder: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434 \u0432\u0440\u0443\u0447\u043D\u0443\u044E", className: "h-11 flex-1 rounded-lg border px-3 py-2" }), _jsx("button", { className: "rounded-lg border px-3", onClick: () => {
                                                        void (async () => {
                                                            const found = await findProductByBarcode(outManualBarcode.trim());
                                                            if (found) {
                                                                setSelectedProductId(found.id);
                                                                setOutProductSearch(found.name);
                                                                setOutModalError("");
                                                            }
                                                            else {
                                                                setOutModalError(`Штрихкод ${outManualBarcode.trim()} не найден в каталоге`);
                                                            }
                                                        })();
                                                    }, children: "\u041D\u0430\u0439\u0442\u0438" })] })) : null, outModalScanning ? (_jsxs("div", { className: "mt-3 rounded-xl border p-2", children: [_jsx(BarcodeScanner, { embedded: true, onDetected: (code) => {
                                                        return (async () => {
                                                            const found = await findProductByBarcode(code);
                                                            if (found) {
                                                                setSelectedProductId(found.id);
                                                                setOutProductSearch(found.name);
                                                                setOutModalScanning(false);
                                                                return { ok: true, message: `✓ Найден: ${found.name}`, autoClose: true };
                                                            }
                                                            else {
                                                                setMessage("Товар не найден по штрихкоду");
                                                                return { ok: false, message: `✗ Не найден: ${code}`, autoClose: false };
                                                            }
                                                        })();
                                                    }, onClose: () => setOutModalScanning(false) }), _jsx("button", { className: "mt-2 w-full rounded-lg border px-3 py-2", onClick: () => setOutModalScanning(false), children: "\u041E\u0442\u043C\u0435\u043D\u0430 \u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F" })] })) : null, showOutProductDropdown ? (_jsx("div", { className: "absolute left-0 right-0 top-12 z-20 max-h-60 overflow-auto rounded-lg border bg-white shadow", children: (outModalProductsQuery.data ?? []).map((p) => (_jsxs("button", { type: "button", className: "flex w-full items-center justify-between border-b px-3 py-2 text-left last:border-b-0", onMouseDown: (e) => e.preventDefault(), onClick: () => {
                                                    setSelectedProductId(p.id);
                                                    setOutProductSearch(p.name);
                                                    setOutModalError("");
                                                }, children: [_jsx("span", { children: p.name }), _jsxs("span", { className: "text-xs text-slate-500", children: ["\u041E\u0441\u0442\u0430\u0442\u043E\u043A: ", stockMap.get(p.id) ?? 0] })] }, p.id))) })) : null] }), _jsx(NumberInput, { className: "rounded-lg border px-3 py-2", value: qty, onChange: setQty, placeholder: "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E" }), _jsxs("select", { className: "rounded-lg border bg-white px-3 py-2", value: outType, onChange: (e) => setOutType(e.target.value), children: [_jsx("option", { value: "expired", children: "\u23F0 \u041F\u0440\u043E\u0441\u0440\u043E\u0447\u043A\u0430" }), _jsx("option", { value: "damaged", children: "\uD83D\uDCA5 \u041F\u043E\u0440\u0447\u0430 / \u0431\u043E\u0439" }), _jsx("option", { value: "theft", children: "\uD83D\uDEAB \u041A\u0440\u0430\u0436\u0430 / \u043D\u0435\u0434\u043E\u0441\u0442\u0430\u0447\u0430" }), _jsx("option", { value: "own_use", children: "\uD83C\uDFE0 \u0412\u043D\u0443\u0442\u0440\u0435\u043D\u043D\u0435\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u0438\u0435" }), _jsx("option", { value: "return_to_supplier", children: "\u21A9\uFE0F \u0412\u043E\u0437\u0432\u0440\u0430\u0442 \u043F\u043E\u0441\u0442\u0430\u0432\u0449\u0438\u043A\u0443" }), _jsx("option", { value: "other", children: "\uD83D\uDCE6 \u0414\u0440\u0443\u0433\u043E\u0435" })] }), _jsx("input", { type: "date", className: "rounded-lg border px-3 py-2", value: movementDate, onChange: (e) => setMovementDate(e.target.value) }), _jsx("input", { className: "rounded-lg border px-3 py-2 md:col-span-2", value: outReason, onChange: (e) => setOutReason(e.target.value), placeholder: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)" })] }), outModalError ? _jsx("div", { className: "mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700", children: outModalError }) : null, _jsxs("div", { className: "mt-4 flex gap-2", children: [_jsx("button", { type: "button", disabled: movementMutation.isPending, className: "rounded-xl bg-primary px-4 py-2 text-white disabled:opacity-60", onClick: () => {
                                        const resolvedId = resolveOutgoingProductId();
                                        if (resolvedId) {
                                            setSelectedProductId(resolvedId);
                                        }
                                        const productId = resolvedId ?? (selectedProductId !== "" ? Number(selectedProductId) : NaN);
                                        if (!Number.isFinite(productId) || productId < 1 || Number(qty) < 1) {
                                            setOutModalError("Выберите товар из списка и укажите количество от 1 до 9999");
                                            setMessage("Выберите товар и укажите количество");
                                            return;
                                        }
                                        setOutModalError("");
                                        movementMutation.mutate({
                                            product_id: productId,
                                            quantity: Math.min(9999, Math.max(1, Math.floor(Number(qty)))),
                                            type: "writeoff",
                                            writeoff_reason: outType,
                                            reason: outReason.trim() || null,
                                        });
                                    }, children: movementMutation.isPending ? "Сохранение…" : "Сохранить" }), _jsx("button", { className: "rounded-xl border px-4 py-2", onClick: () => setShowOutModal(false), children: "\u041E\u0442\u043C\u0435\u043D\u0430" })] })] }) })) : null, showReturnModal ? (_jsx("div", { className: modalOverlay, children: _jsxs("div", { className: modalCard, children: [_jsxs("div", { className: "mb-3 flex items-start justify-between", children: [_jsx("h3", { className: "text-xl font-semibold", children: "\u0412\u043E\u0437\u0432\u0440\u0430\u0442 \u0442\u043E\u0432\u0430\u0440\u0430" }), _jsx("button", { className: "text-2xl text-slate-500", onClick: () => {
                                        setShowReturnModal(false);
                                        setReturnProduct(null);
                                        setReturnProductSearch("");
                                        setSelectedSale(null);
                                        setReturnSelectedItems([]);
                                    }, children: "\u00D7" })] }), !returnProduct ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "mb-2 text-sm text-slate-500", children: "\u041D\u0430\u0439\u0434\u0438\u0442\u0435 \u0442\u043E\u0432\u0430\u0440, \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u043A\u043B\u0438\u0435\u043D\u0442 \u0445\u043E\u0447\u0435\u0442 \u0432\u0435\u0440\u043D\u0443\u0442\u044C" }), _jsx("input", { className: "mb-3 w-full rounded-lg border px-3 py-2", value: returnProductSearch, onChange: (e) => setReturnProductSearch(e.target.value), placeholder: "\u041F\u043E\u0438\u0441\u043A \u043F\u043E \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044E \u0438\u043B\u0438 \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434\u0443", autoFocus: true }), _jsxs("div", { className: "max-h-72 overflow-auto rounded-lg border", children: [products
                                            .filter((p) => {
                                            const q = returnProductSearch.trim().toLowerCase();
                                            if (!q)
                                                return false;
                                            return (p.name.toLowerCase().includes(q) ||
                                                (p.barcode || "").includes(q));
                                        })
                                            .slice(0, 30)
                                            .map((p) => (_jsxs("button", { className: "block w-full border-b px-3 py-2 text-left hover:bg-slate-50", onClick: () => {
                                                setReturnProduct(p);
                                                setSelectedSale(null);
                                                setReturnSelectedItems([]);
                                            }, children: [_jsx("p", { className: "text-sm font-medium", children: p.name }), _jsx("p", { className: "text-xs text-slate-500", children: p.barcode || "—" })] }, p.id))), returnProductSearch.trim() && (products ?? []).filter((p) => p.name.toLowerCase().includes(returnProductSearch.trim().toLowerCase()) || (p.barcode || "").includes(returnProductSearch.trim())).length === 0 ? (_jsx("p", { className: "p-3 text-sm text-slate-500", children: "\u0422\u043E\u0432\u0430\u0440 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" })) : null] })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mb-3 flex items-center justify-between rounded-lg bg-slate-50 p-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm text-slate-500", children: "\u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u043C \u0442\u043E\u0432\u0430\u0440:" }), _jsx("p", { className: "font-semibold", children: returnProduct.name })] }), _jsx("button", { className: "text-sm text-primary", onClick: () => { setReturnProduct(null); setSelectedSale(null); setReturnSelectedItems([]); }, children: "\u2190 \u0421\u043C\u0435\u043D\u0438\u0442\u044C \u0442\u043E\u0432\u0430\u0440" })] }), salesByProductQuery.isLoading ? (_jsx("p", { className: "text-sm text-slate-500", children: "\u041F\u043E\u0438\u0441\u043A \u043F\u0440\u043E\u0434\u0430\u0436..." })) : (salesByProductQuery.data ?? []).length === 0 ? (_jsx("p", { className: "rounded-lg bg-amber-50 p-3 text-sm text-amber-700", children: "\u042D\u0442\u043E\u0442 \u0442\u043E\u0432\u0430\u0440 \u043D\u0438\u0433\u0434\u0435 \u043D\u0435 \u043F\u0440\u043E\u0434\u0430\u0432\u0430\u043B\u0441\u044F (\u0438\u043B\u0438 \u0432\u0441\u0435 \u043F\u0440\u043E\u0434\u0430\u0436\u0438 \u0443\u0436\u0435 \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0435\u043D\u044B)" })) : (_jsxs(_Fragment, { children: [_jsx("p", { className: "mb-2 text-sm text-slate-500", children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0440\u043E\u0434\u0430\u0436\u0443 (\u043F\u043E \u0434\u0430\u0442\u0435 \u2014 \u043E\u0442 \u0441\u0432\u0435\u0436\u0438\u0445 \u043A \u0441\u0442\u0430\u0440\u044B\u043C):" }), _jsx("div", { className: "mb-3 max-h-72 space-y-2 overflow-auto", children: (salesByProductQuery.data ?? []).map((sale) => {
                                                const isSelected = selectedSale?.id === sale.id;
                                                const dt = sale.created_at ? new Date(sale.created_at).toLocaleString() : "—";
                                                return (_jsxs("div", { className: `rounded-lg border ${isSelected ? "border-primary bg-indigo-50" : ""}`, children: [_jsx("button", { className: "block w-full p-3 text-left", onClick: () => {
                                                                setSelectedSale(sale);
                                                                setReturnSelectedItems([]);
                                                            }, children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsxs("p", { className: "font-medium", children: ["\u041F\u0440\u043E\u0434\u0430\u0436\u0430 #", sale.id] }), _jsx("p", { className: "text-xs text-slate-500", children: dt })] }), _jsxs("div", { className: "text-right", children: [_jsxs("p", { className: "font-semibold", children: [Number(sale.total ?? 0).toFixed(2), " \u0441\u043E\u043C"] }), sale.customer_name ? _jsx("p", { className: "text-xs text-slate-500", children: sale.customer_name }) : null] })] }) }), isSelected && sale.items?.length ? (_jsxs("div", { className: "border-t bg-white p-3", children: [_jsx("p", { className: "mb-2 text-xs text-slate-500", children: "\u041E\u0442\u043C\u0435\u0442\u044C\u0442\u0435 \u043F\u043E\u0437\u0438\u0446\u0438\u0438 \u0434\u043B\u044F \u0432\u043E\u0437\u0432\u0440\u0430\u0442\u0430:" }), _jsx("div", { className: "space-y-1", children: sale.items.map((item) => {
                                                                        const checked = returnSelectedItems.includes(item.id);
                                                                        const isOurProduct = item.product_id === returnProduct.id;
                                                                        return (_jsxs("label", { className: `flex items-center gap-2 rounded-md p-2 ${isOurProduct ? "bg-amber-50" : ""}`, children: [_jsx("input", { type: "checkbox", checked: checked, onChange: () => setReturnSelectedItems((prev) => checked ? prev.filter((x) => x !== item.id) : [...prev, item.id]) }), _jsxs("span", { className: "flex-1 text-sm", children: [item.product_name || `Товар #${item.product_id}`, isOurProduct ? _jsx("span", { className: "ml-1 text-xs text-amber-700", children: "\u2190 \u0438\u0441\u043A\u043E\u043C\u044B\u0439" }) : null] }), _jsxs("span", { className: "text-sm font-medium", children: [item.quantity, " \u00D7 ", Number(item.price).toFixed(2)] })] }, item.id));
                                                                    }) })] })) : null] }, sale.id));
                                            }) }), selectedSale ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid grid-cols-1 gap-3 md:grid-cols-2", children: [_jsx("input", { className: "rounded-lg border px-3 py-2 md:col-span-2", value: returnReason, onChange: (e) => setReturnReason(e.target.value), placeholder: "\u041F\u0440\u0438\u0447\u0438\u043D\u0430 \u0432\u043E\u0437\u0432\u0440\u0430\u0442\u0430 (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)" }), _jsxs("select", { className: "rounded-lg border px-3 py-2", value: refundMethod, onChange: (e) => setRefundMethod(e.target.value), children: [_jsx("option", { value: "cash", children: "\u0412\u043E\u0437\u0432\u0440\u0430\u0442 \u043D\u0430\u043B\u0438\u0447\u043D\u044B\u043C\u0438" }), _jsx("option", { value: "card", children: "\u0412\u043E\u0437\u0432\u0440\u0430\u0442 \u043D\u0430 \u043A\u0430\u0440\u0442\u0443" }), _jsx("option", { value: "transfer", children: "\u0412\u043E\u0437\u0432\u0440\u0430\u0442 \u043F\u0435\u0440\u0435\u0432\u043E\u0434\u043E\u043C" })] })] }), _jsxs("div", { className: "mt-4 flex gap-2", children: [_jsx("button", { className: "rounded-xl bg-primary px-4 py-2 text-white disabled:opacity-50", disabled: !returnSelectedItems.length || returnMutation.isPending, onClick: () => returnMutation.mutate(), children: returnMutation.isPending ? "Сохранение..." : `Оформить возврат (${returnSelectedItems.length})` }), _jsx("button", { className: "rounded-xl border px-4 py-2", onClick: () => { setSelectedSale(null); setReturnSelectedItems([]); }, children: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0432\u044B\u0431\u043E\u0440" })] })] })) : null] }))] }))] }) })) : null, showScanner ? (_jsx(BarcodeScanner, { onDetected: onScanned, onClose: () => setShowScanner(false) }, scannerSession)) : null, scanActionProduct ? (_jsx("div", { className: modalOverlay, children: _jsxs("div", { className: "mx-auto mt-20 max-w-md rounded-2xl bg-white p-5", children: [_jsxs("h3", { className: "mb-2 text-lg font-semibold", children: ["\u0422\u043E\u0432\u0430\u0440 \u043D\u0430\u0439\u0434\u0435\u043D: ", scanActionProduct.name] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("button", { className: "rounded-lg bg-primary px-3 py-2 text-white", onClick: () => { openInModal(scanActionProduct.id); setScanActionProduct(null); }, children: "\u041F\u0440\u0438\u0445\u043E\u0434" }), _jsx("button", { className: "rounded-lg border px-3 py-2", onClick: () => { openOutModal(scanActionProduct.id); setScanActionProduct(null); }, children: "\u0420\u0430\u0441\u0445\u043E\u0434" }), _jsx("button", { className: "rounded-lg border px-3 py-2", onClick: () => { openProductCard(scanActionProduct); setScanActionProduct(null); }, children: "\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430" }), _jsx("button", { className: "rounded-lg border px-3 py-2", onClick: () => setScanActionProduct(null), children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })] })] }) })) : null, editingMovement ? (_jsx("div", { className: modalOverlay, onClick: () => setEditingMovement(null), children: _jsxs("div", { className: `${modalCard} max-w-md`, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "mb-3 flex items-start justify-between", children: [_jsxs("h3", { className: "text-lg font-semibold", children: ["\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C ", MOVEMENT_TYPE_LABEL[editingMovement.type] ?? editingMovement.type, " #", editingMovement.id] }), _jsx("button", { onClick: () => setEditingMovement(null), className: "text-2xl text-slate-400", "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C", children: "\u00D7" })] }), _jsxs("p", { className: "mb-3 text-sm text-slate-500", children: ["\u0422\u043E\u0432\u0430\u0440: ", _jsx("b", { children: products.find((p) => p.id === editingMovement.product_id)?.name ?? "?" }), _jsx("br", {}), "\u041F\u043E\u0441\u043B\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F \u043E\u0441\u0442\u0430\u0442\u043E\u043A \u043D\u0430 \u0441\u043A\u043B\u0430\u0434\u0435 \u043F\u0435\u0440\u0435\u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438."] }), _jsxs("label", { className: "mb-2 block", children: [_jsx("span", { className: "mb-1 block text-xs text-slate-500", children: "\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E" }), _jsx("input", { type: "text", inputMode: "decimal", value: editMovementQty, onChange: (e) => setEditMovementQty(e.target.value), className: "h-10 w-full rounded-lg border border-slate-300 px-3 text-right tabular-nums" })] }), editingMovement.type === "in" ? (_jsxs("label", { className: "mb-2 block", children: [_jsx("span", { className: "mb-1 block text-xs text-slate-500", children: "\u0426\u0435\u043D\u0430 \u0437\u0430\u043A\u0443\u043F\u043A\u0438 \u0437\u0430 \u0435\u0434\u0438\u043D\u0438\u0446\u0443 (\u0441\u043E\u043C)" }), _jsx("input", { type: "text", inputMode: "decimal", value: editMovementCost, onChange: (e) => setEditMovementCost(e.target.value), className: "h-10 w-full rounded-lg border border-slate-300 px-3 text-right tabular-nums" })] })) : null, _jsxs("label", { className: "mb-3 block", children: [_jsx("span", { className: "mb-1 block text-xs text-slate-500", children: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439" }), _jsx("input", { type: "text", value: editMovementReason, onChange: (e) => setEditMovementReason(e.target.value), className: "h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "button", onClick: () => updateMovementMutation.mutate(), disabled: updateMovementMutation.isPending, className: "flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60", children: updateMovementMutation.isPending ? "Сохраняю…" : "Сохранить" }), _jsx("button", { type: "button", onClick: () => setEditingMovement(null), className: "rounded-lg border border-slate-300 px-4 py-2 text-sm", children: "\u041E\u0442\u043C\u0435\u043D\u0430" })] })] }) })) : null] }));
}
