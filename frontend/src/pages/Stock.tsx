import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

import { BarcodeScanner } from "../components/BarcodeScanner";
import { NumberInput } from "../components/NumberInput";
import { useBusinessSettings } from "../hooks/useBusinessSettings";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";

type Product = {
  id: number;
  name: string;
  barcode?: string;
  min_stock?: number;
  purchase_price?: number;
  sale_price?: number;
  description?: string;
  warranty_months?: number;
  shelf_life_days?: number | null;
  supplier_id?: number | null;
};

type StockSummary = {
  product_id: number;
  name: string;
  barcode: string;
  balance: number;
  min_expiry_date?: string | null;
  last_cost_price?: string | number | null;
  margin_pct?: number | null;
};

type Movement = {
  id: number;
  product_id: number;
  type: string;
  quantity: number;
  created_at?: string;
  created_by_name?: string;
};

type Sale = {
  id: number;
  created_at?: string;
  status?: string;
  total?: number;
  customer_name?: string | null;
  items?: { id: number; product_id: number; product_name?: string | null; quantity: number; price: number }[];
};

type Mode = "stock" | "revision";
type ScanContext = "header";

const today = () => new Date().toISOString().slice(0, 10);

const moneyFmt = (value: number | string | null | undefined): string => {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
};

/** "1400,00" / "1 400.50" → число (для локальных клавиатур) */
function parseMoney(raw: string): number {
  const s = String(raw ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/,/g, ".");
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function formatMoneyFromApi(value: unknown): string {
  if (value === null || value === undefined) return "0";
  if (typeof value === "number") return String(value);
  return String(parseMoney(String(value)));
}

function extractAxiosDetail(error: unknown): string {
  if (!axios.isAxiosError(error)) return String(error);
  const d = error.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d
      .map((item: unknown) =>
        typeof item === "object" && item !== null && "msg" in item
          ? String((item as { msg?: string }).msg)
          : JSON.stringify(item),
      )
      .join("; ");
  }
  if (d != null && typeof d === "object") return JSON.stringify(d);
  return error.message;
}

async function fetchBarcodeDataUrl(productId: number): Promise<string | null> {
  try {
    const res = await api.get(`/products/${productId}/barcode/image`, { responseType: "blob" });
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(res.data);
    });
  } catch {
    return null;
  }
}

const modalOverlay = "fixed inset-0 z-50 bg-black/50 p-4";

const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  in: "Приход",
  out: "Расход",
  writeoff: "Списание",
};
const modalCard = "mx-auto mt-8 max-w-2xl rounded-2xl bg-white p-5 shadow-xl max-h-[92vh] overflow-y-auto";

/** Кнопки панели склада: без фикс. height — иначе двухстрочный текст обрезается */
const stockToolbarBtn =
  "inline-flex min-h-11 min-w-0 max-w-full shrink-0 items-center justify-center rounded-xl px-3 py-2 text-center text-sm font-medium leading-snug";

export function StockPage() {
  const isOwner = useAuthStore((s) => s.role === "owner");
  const { type: businessType, hasExpiryDate } = useBusinessSettings();
  const isGrocery = businessType === "grocery";

  const suppliersQuery = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await api.get("/suppliers")).data as { id: number; name: string }[],
    enabled: isGrocery,
  });
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("stock");
  const [search, setSearch] = useState("");
  const [movementFilter, setMovementFilter] = useState("");
  const [message, setMessage] = useState("");

  const [showScanner, setShowScanner] = useState(false);
  const [scanContext, setScanContext] = useState<ScanContext>("header");
  const [inModalScanning, setInModalScanning] = useState(false);
  const [outModalScanning, setOutModalScanning] = useState(false);
  const [scanActionProduct, setScanActionProduct] = useState<Product | null>(null);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [barcodePreviewUrl, setBarcodePreviewUrl] = useState<string | null>(null);
  const [barcodePreviewLoading, setBarcodePreviewLoading] = useState(false);
  const [showInModal, setShowInModal] = useState(false);
  const [showOutModal, setShowOutModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);

  const [selectedProductId, setSelectedProductId] = useState<number | "">("");
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
  const [inReceiptMode, setInReceiptMode] = useState<"existing" | "create">("existing");
  const [newProductName, setNewProductName] = useState("");
  const [newProductMinStock, setNewProductMinStock] = useState("1");
  const [newCardBarcode, setNewCardBarcode] = useState("");
  const [useAutoBarcode, setUseAutoBarcode] = useState(false);
  // Grocery-поля (показываются только если isGrocery)
  const [newProductCategory, setNewProductCategory] = useState("");
  const [newProductKind, setNewProductKind] = useState<"piece" | "weighed" | "volume">("piece");
  const [newProductUnit, setNewProductUnit] = useState("шт");
  const [newProductPlu, setNewProductPlu] = useState("");
  const [newProductShelfLife, setNewProductShelfLife] = useState("");
  const [newProductStorageTemp, setNewProductStorageTemp] = useState("");
  // Поле «Поставщик» в модалке нового товара: храним введённое имя, при сохранении
  // ищем supplier_id в базе.
  const [newProductManufacturer, setNewProductManufacturer] = useState("");
  const [barcodeMiss, setBarcodeMiss] = useState<string | null>(null);
  const [newProductWarranty, setNewProductWarranty] = useState("");
  const [inModalScanInfo, setInModalScanInfo] = useState<{ ok: boolean; text: string } | null>(null);
  const [inFormTouched, setInFormTouched] = useState(false);
  const [inModalError, setInModalError] = useState("");
  const [outModalError, setOutModalError] = useState("");
  const [inManualMode, setInManualMode] = useState(false);
  const [outManualMode, setOutManualMode] = useState(false);
  const [inManualBarcode, setInManualBarcode] = useState("");
  const [outManualBarcode, setOutManualBarcode] = useState("");

  const [salesSearch, setSalesSearch] = useState("");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [returnSelectedItems, setReturnSelectedItems] = useState<number[]>([]);
  // New return-by-product state
  const [returnProductSearch, setReturnProductSearch] = useState("");
  const [returnProduct, setReturnProduct] = useState<Product | null>(null);

  const [revisionFactual, setRevisionFactual] = useState<Record<number, number>>({});
  const [revisionScanTime, setRevisionScanTime] = useState<Record<number, number>>({});
  const [revisionMissing, setRevisionMissing] = useState<Record<number, boolean>>({});
  const [revisionScannerOn, setRevisionScannerOn] = useState(false);
  const [revisionSearch, setRevisionSearch] = useState("");
  const [revisionShowMissing, setRevisionShowMissing] = useState(false);
  // false = просмотр истории; true = активная сессия сканирования
  const [revisionActive, setRevisionActive] = useState(false);
  const [movementsPage, setMovementsPage] = useState(1);

  // Bulk barcode print mode
  const [barcodeSelectMode, setBarcodeSelectMode] = useState(false);
  const [selectedForBarcode, setSelectedForBarcode] = useState<Set<number>>(new Set());

  // Сессия сканера — меняется при каждом открытии и (для ревизии) после каждого
  // скана, чтобы React пересоздавал MediaStream и iOS заново наводил автофокус.
  const [scannerSession, setScannerSession] = useState(0);
  const isDesktop = typeof window !== "undefined" ? window.innerWidth > 768 : false;
  const incomingTotal = Math.max(0, Number(qty || 0) * parseMoney(purchasePrice));
  const inQtyInvalid = inFormTouched && (Number(qty) < 1 || Number(qty) > 9999);

  const productsQuery = useQuery({
    queryKey: ["products-all"],
    queryFn: async () => (await api.get("/products")).data as Product[],
  });

  const stockQuery = useQuery({
    queryKey: ["stock-summary"],
    queryFn: async () => (await api.get("/stock")).data as StockSummary[],
  });

  type LastRevision = {
    found: boolean;
    completed_at?: string;
    by_user?: string | null;
    surplus?: number;
    shortage?: number;
    surplus_value_purchase?: number;
    shortage_value_purchase?: number;
    surplus_value_sale?: number;
    shortage_value_sale?: number;
    items_count?: number;
    items?: {
      product_id: number;
      product_name: string | null;
      delta: number;
      type: string;
      quantity: number;
      expected_qty?: number | null;
      actual_qty?: number | null;
      purchase_price?: number | null;
      sale_price?: number | null;
      purchase_value?: number | null;
      sale_value?: number | null;
    }[];
  };
  const lastRevisionQuery = useQuery({
    queryKey: ["last-revision"],
    queryFn: async (): Promise<LastRevision> => {
      try {
        return (await api.get("/stock/revisions/last")).data as LastRevision;
      } catch {
        return { found: false };
      }
    },
  });

  const movementsQuery = useQuery({
    queryKey: ["stock-movements"],
    queryFn: async () => {
      try {
        // Bigger limit so the "sort by last incoming" on the products list has enough history.
        return (await api.get("/stock/movements", { params: { limit: 1000 } })).data as Movement[];
      } catch {
        return [] as Movement[];
      }
    },
  });

  const salesQuery = useQuery({
    queryKey: ["sales-completed-legacy", salesSearch],
    enabled: false,  // legacy: replaced by per-product search in the new return modal
    queryFn: async () => {
      const response = await api.get("/sales", { params: { status: "completed" } });
      const list = Array.isArray(response.data) ? (response.data as Sale[]) : [];
      return list.filter(
        (sale) =>
          !salesSearch ||
          String(sale.id).includes(salesSearch) ||
          String(sale.created_at ?? "").slice(0, 10).includes(salesSearch),
      );
    },
  });

  const inModalProductsQuery = useQuery({
    queryKey: ["stock-in-product-search", inProductSearch],
    enabled: showInModal && inReceiptMode === "existing" && inProductSearch.trim().length >= 2,
    queryFn: async () =>
      (await api.get("/products", { params: { q: inProductSearch.trim(), search: inProductSearch.trim() } })).data as Product[],
  });

  const outModalProductsQuery = useQuery({
    queryKey: ["stock-out-product-search", outProductSearch],
    enabled: showOutModal && outProductSearch.trim().length >= 2,
    queryFn: async () =>
      (await api.get("/products", { params: { q: outProductSearch.trim(), search: outProductSearch.trim() } })).data as Product[],
  });

  const stockMap = useMemo(
    () => new Map((stockQuery.data ?? []).map((row) => [row.product_id, row.balance])),
    [stockQuery.data],
  );

  const expiryMap = useMemo(
    () =>
      new Map(
        (stockQuery.data ?? [])
          .filter((row) => row.min_expiry_date)
          .map((row) => [row.product_id, row.min_expiry_date as string]),
      ),
    [stockQuery.data],
  );

  /** Возвращает дни до истечения (отрицательное = просрочен) и цвет-класс бейджа. */
  const expiryInfo = (productId: number): { days: number; classes: string; label: string } | null => {
    const dateStr = expiryMap.get(productId);
    if (!dateStr) return null;
    const target = new Date(dateStr + "T00:00:00");
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const days = Math.floor((target.getTime() - now.getTime()) / 86400000);
    if (days < 0) return { days, classes: "bg-rose-100 text-rose-700", label: `Просрочен на ${Math.abs(days)} дн` };
    if (days === 0) return { days, classes: "bg-rose-100 text-rose-700", label: "Истекает сегодня" };
    if (days <= 3) return { days, classes: "bg-amber-100 text-amber-700", label: `${days} дн` };
    if (days <= 7) return { days, classes: "bg-orange-100 text-orange-700", label: `${days} дн` };
    return { days, classes: "bg-emerald-100 text-emerald-700", label: `${days} дн` };
  };

  const expiringSoonCount = useMemo(() => {
    if (!isGrocery) return 0;
    return (stockQuery.data ?? []).filter((row) => {
      if (!row.min_expiry_date) return false;
      const target = new Date(row.min_expiry_date + "T00:00:00");
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const days = Math.floor((target.getTime() - now.getTime()) / 86400000);
      return days <= 3;
    }).length;
  }, [stockQuery.data, isGrocery]);

  const products = productsQuery.data ?? [];

  /** Если товар визуально «выбран» (одна строка в поиске / точное имя), подставляем id без обязательного клика */
  function resolveIncomingProductId(): number | null {
    if (selectedProductId !== "") return Number(selectedProductId);
    const q = inProductSearch.trim().toLowerCase();
    if (!q) return null;
    const fromDropdown = inModalProductsQuery.data ?? [];
    if (fromDropdown.length === 1) return fromDropdown[0].id;
    const exactDrop = fromDropdown.find((p) => p.name.trim().toLowerCase() === q);
    if (exactDrop) return exactDrop.id;
    const exactCat = products.find((p) => p.name.trim().toLowerCase() === q);
    return exactCat?.id ?? null;
  }

  function resolveOutgoingProductId(): number | null {
    if (selectedProductId !== "") return Number(selectedProductId);
    const q = outProductSearch.trim().toLowerCase();
    if (!q) return null;
    const fromDropdown = outModalProductsQuery.data ?? [];
    if (fromDropdown.length === 1) return fromDropdown[0].id;
    const exactDrop = fromDropdown.find((p) => p.name.trim().toLowerCase() === q);
    if (exactDrop) return exactDrop.id;
    const exactCat = products.find((p) => p.name.trim().toLowerCase() === q);
    return exactCat?.id ?? null;
  }

  const resolvedIncomingId = resolveIncomingProductId();
  const inProductInvalid =
    inReceiptMode === "existing" &&
    inFormTouched &&
    !resolvedIncomingId &&
    selectedProductId === "";

  const qSearch = inProductSearch.trim();
  const searchFetching = inModalProductsQuery.isFetching && qSearch.length >= 2;
  const nameSearchEmpty =
    inReceiptMode === "existing" &&
    !searchFetching &&
    inModalProductsQuery.isFetched &&
    qSearch.length >= 2 &&
    (inModalProductsQuery.data ?? []).length === 0;
  const showNameMissOffer =
    nameSearchEmpty && selectedProductId === "" && !resolvedIncomingId && !barcodeMiss;
  const showBarcodeMissOffer = Boolean(barcodeMiss) && inReceiptMode === "existing" && selectedProductId === "";

  /** После выбора товара из списка поле совпадает с названием — не держим выпадашку (перекрывает форму) */
  const selectedStockProduct =
    selectedProductId !== "" ? products.find((p) => p.id === Number(selectedProductId)) : undefined;
  const inProductSearchCommitted =
    Boolean(
      selectedStockProduct &&
        selectedStockProduct.name.trim().toLowerCase() === inProductSearch.trim().toLowerCase(),
    );
  const showInProductDropdown =
    inReceiptMode === "existing" &&
    inProductSearch.trim().length >= 2 &&
    !inProductSearchCommitted;
  const outProductSearchCommitted =
    Boolean(
      selectedStockProduct &&
        selectedStockProduct.name.trim().toLowerCase() === outProductSearch.trim().toLowerCase(),
    );
  const showOutProductDropdown =
    showOutModal && outProductSearch.trim().length >= 2 && !outProductSearchCommitted;

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  // Build a map: product_id → timestamp of the most recent in-stock movement
  // (used to sort products by «last incoming first»; products without movements fall back to id).
  const lastIncomingByProduct = new Map<number, number>();
  (movementsQuery.data ?? []).forEach((m) => {
    if (m.type !== "in" || !m.created_at) return;
    const ts = new Date(m.created_at).getTime();
    const prev = lastIncomingByProduct.get(m.product_id) ?? 0;
    if (ts > prev) lastIncomingByProduct.set(m.product_id, ts);
  });

  const rows = (stockQuery.data ?? [])
    .map((stockRow) => {
      const product = productMap.get(stockRow.product_id);
      if (!product) return null;
      return {
        ...product,
        balance: Number(stockRow.balance ?? 0),
        min_stock: Number(product.min_stock ?? 0),
        last_cost_price: stockRow.last_cost_price != null ? Number(stockRow.last_cost_price) : null,
        margin_pct: stockRow.margin_pct != null ? Number(stockRow.margin_pct) : null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .filter((row) => row.name.toLowerCase().includes(search.toLowerCase()))
    .filter((row) => {
      if (!expiringOnly) return true;
      const info = expiryInfo(row.id);
      return info != null && info.days <= 3;
    })
    .sort((a, b) => {
      // Primary: most recent incoming first; products without history go below those with history,
      // sorted by id desc among themselves.
      const aLast = lastIncomingByProduct.get(a.id) ?? 0;
      const bLast = lastIncomingByProduct.get(b.id) ?? 0;
      if (aLast !== bLast) return bLast - aLast;
      return b.id - a.id;
    });

  const allFilteredMovements = (movementsQuery.data ?? []).filter((m) => !movementFilter || m.type === movementFilter);
  const movementsPageSize = 20;
  const movementsTotalPages = Math.max(1, Math.ceil(allFilteredMovements.length / movementsPageSize));
  const currentMovementsPage = Math.min(movementsPage, movementsTotalPages);
  const filteredMovements = allFilteredMovements.slice(
    (currentMovementsPage - 1) * movementsPageSize,
    currentMovementsPage * movementsPageSize,
  );
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

  const openInModal = (productId?: number, opts?: { newProductOnly?: boolean }) => {
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
    setPurchasePrice(
      preselected && Number(preselected.purchase_price ?? 0) > 0
        ? String(preselected.purchase_price)
        : "",
    );
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

  const openOutModal = (productId?: number) => {
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
    mutationFn: async (payload: Record<string, unknown>) => {
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

  const generateBarcodeMutation = useMutation({
    mutationFn: async (productId: number) => {
      await api.post(`/products/${productId}/barcode`);
      await queryClient.invalidateQueries({ queryKey: ["products-all"] });
      setMessage("Штрихкод сгенерирован");
    },
    onError: () => setMessage("Не удалось сгенерировать штрихкод"),
  });

  const createProductAndReceiptMutation = useMutation({
    mutationFn: async () => {
      const q = Math.min(9999, Math.max(1, Math.floor(Number(qty))));
      const productPayload: Record<string, unknown> = {
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
      const created = (await api.post<Product>("/products", productPayload)).data;
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
      const response = await api.get(`/sales/by-product/${returnProduct!.id}`);
      return (Array.isArray(response.data) ? response.data : []) as Sale[];
    },
  });

  const returnMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSale) return;
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
      const items: { product_id: number; expected_qty: number; actual_qty: number }[] = [];
      rows.forEach((row) => {
        if (row.id in revisionFactual) {
          items.push({
            product_id: row.id,
            expected_qty: row.balance,
            actual_qty: Math.max(0, Math.floor(Number(revisionFactual[row.id]))),
          });
        } else if (revisionMissing[row.id]) {
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

  const printBarcode = async (product: Product) => {
    const printWindow = window.open("", "_blank", "width=500,height=700");
    if (!printWindow) return;
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

  const printBarcodesBatch = async (productIds: number[]) => {
    if (!productIds.length) return;
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      setMessage("Браузер заблокировал всплывающее окно. Разрешите его и попробуйте снова.");
      return;
    }
    // Show a "loading" placeholder while we fetch barcode images sequentially.
    printWindow.document.write("<html><body style=\"font-family:Arial;padding:24px\">Загрузка штрихкодов…</body></html>");

    const items: { name: string; barcode: string; price: number; dataUrl: string | null }[] = [];
    for (const id of productIds) {
      const p = products.find((x) => x.id === id);
      if (!p) continue;
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

  const openProductCard = (p: Product) => {
    setBarcodePreviewLoading(true);
    setBarcodePreviewUrl(null);
    setSelectedProduct(p);
  };

  const findProductByBarcode = async (code: string) => {
    let found = products.find((p) => p.barcode === code);
    if (!found) {
      try {
        const response = await api.get(`/products/barcode/${code}`);
        found = response.data as Product;
      } catch {
        found = undefined;
      }
    }
    return found;
  };

  const onScanned = async (code: string) => {
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
      if (diff > 0) surplus += diff;
      else if (diff < 0) shortage += -diff;
    });
    missingRows.forEach((row) => {
      if (revisionMissing[row.id]) shortage += row.balance;
    });
    const changesCount =
      Object.keys(revisionFactual).filter(
        (idStr) => Number(revisionFactual[Number(idStr)]) !== (rows.find((r) => r.id === Number(idStr))?.balance ?? 0),
      ).length + Object.values(revisionMissing).filter(Boolean).length;

    const addByBarcode = async (code: string) => {
      const found = await findProductByBarcode(code);
      if (!found) return { ok: false, message: `✗ Не найден: ${code}`, autoClose: false };
      const inRows = rows.find((r) => r.id === found.id);
      if (!inRows) return { ok: false, message: `Товар найден, но без остатка в каталоге`, autoClose: false };
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

    return (
      <main>
        {message ? (
          <div
            className={`mb-3 rounded-xl px-4 py-3 text-sm text-white ${
              message.startsWith("✓") ? "bg-emerald-600" : "bg-slate-900"
            }`}
          >
            {message}
          </div>
        ) : null}
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-3xl font-semibold">Ревизия склада</h1>
          <button
            type="button"
            className="rounded-xl border px-4 py-2"
            onClick={() => {
              if (revisionActive && changesCount > 0) {
                if (!window.confirm("Прервать текущую ревизию? Несохранённые сканы будут потеряны.")) return;
              }
              setRevisionFactual({});
              setRevisionScanTime({});
              setRevisionMissing({});
              setRevisionScannerOn(false);
              setRevisionSearch("");
              setRevisionShowMissing(false);
              setRevisionActive(false);
              setMode("stock");
            }}
          >
            Назад
          </button>
        </div>

        {/* Кнопка «Новая ревизия» в режиме просмотра истории */}
        {!revisionActive ? (
          <div className="mb-4">
            <button
              type="button"
              className="w-full rounded-xl bg-primary px-5 py-4 text-lg font-semibold text-white md:w-auto"
              onClick={() => setRevisionActive(true)}
            >
              + Новая ревизия
            </button>
          </div>
        ) : null}

        {/* Last revision summary (если была) */}
        {lastRevisionQuery.data?.found ? (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-700">Последняя ревизия</p>
                <p className="text-xs text-slate-500">
                  {lastRevisionQuery.data.completed_at
                    ? new Date(lastRevisionQuery.data.completed_at).toLocaleString()
                    : "—"}
                  {lastRevisionQuery.data.by_user ? ` · ${lastRevisionQuery.data.by_user}` : ""}
                </p>
              </div>
              <div className="flex gap-3 text-sm">
                <span className="text-emerald-700">+{lastRevisionQuery.data.surplus ?? 0}</span>
                <span className="text-red-700">-{lastRevisionQuery.data.shortage ?? 0}</span>
                <span className="text-slate-500">{lastRevisionQuery.data.items_count ?? 0} поз.</span>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-slate-200 bg-white p-2">
                <div className="text-slate-500">По закупочной цене</div>
                <div className="mt-1 flex gap-2">
                  <span className="font-semibold text-emerald-700">
                    +{moneyFmt(lastRevisionQuery.data.surplus_value_purchase ?? 0)} сом
                  </span>
                  <span className="font-semibold text-red-700">
                    −{moneyFmt(lastRevisionQuery.data.shortage_value_purchase ?? 0)} сом
                  </span>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-2">
                <div className="text-slate-500">По продажной цене</div>
                <div className="mt-1 flex gap-2">
                  <span className="font-semibold text-emerald-700">
                    +{moneyFmt(lastRevisionQuery.data.surplus_value_sale ?? 0)} сом
                  </span>
                  <span className="font-semibold text-red-700">
                    −{moneyFmt(lastRevisionQuery.data.shortage_value_sale ?? 0)} сом
                  </span>
                </div>
              </div>
            </div>
            {lastRevisionQuery.data.items && lastRevisionQuery.data.items.length > 0 ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-primary">показать состав</summary>
                <div className="mt-2 max-h-72 overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-slate-500">
                        <th className="px-2 py-1">Товар</th>
                        <th className="px-2 py-1 text-right">Система</th>
                        <th className="px-2 py-1 text-right">Факт</th>
                        <th className="px-2 py-1 text-right">Разница</th>
                        <th className="px-2 py-1 text-right">Закуп. цена</th>
                        <th className="px-2 py-1 text-right">Сумма закуп.</th>
                        <th className="px-2 py-1 text-right">Продаж. цена</th>
                        <th className="px-2 py-1 text-right">Сумма продаж.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastRevisionQuery.data.items.map((it, idx) => (
                        <tr key={`${it.product_id}-${idx}`} className={idx % 2 ? "bg-white" : "bg-slate-50"}>
                          <td className="px-2 py-2">{it.product_name || `#${it.product_id}`}</td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {it.expected_qty !== undefined && it.expected_qty !== null ? it.expected_qty : "—"}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {it.actual_qty !== undefined && it.actual_qty !== null ? it.actual_qty : "—"}
                          </td>
                          <td
                            className={`px-2 py-2 text-right font-semibold tabular-nums ${
                              it.delta > 0 ? "text-emerald-700" : "text-red-700"
                            }`}
                          >
                            {it.delta > 0 ? `+${it.delta}` : `${it.delta}`}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                            {it.purchase_price ? moneyFmt(it.purchase_price) : "—"}
                          </td>
                          <td
                            className={`px-2 py-2 text-right font-semibold tabular-nums ${
                              (it.purchase_value ?? 0) > 0
                                ? "text-emerald-700"
                                : (it.purchase_value ?? 0) < 0
                                  ? "text-red-700"
                                  : "text-slate-500"
                            }`}
                          >
                            {it.purchase_value != null
                              ? `${(it.purchase_value > 0 ? "+" : "")}${moneyFmt(it.purchase_value)}`
                              : "—"}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                            {it.sale_price ? moneyFmt(it.sale_price) : "—"}
                          </td>
                          <td
                            className={`px-2 py-2 text-right font-semibold tabular-nums ${
                              (it.sale_value ?? 0) > 0
                                ? "text-emerald-700"
                                : (it.sale_value ?? 0) < 0
                                  ? "text-red-700"
                                  : "text-slate-500"
                            }`}
                          >
                            {it.sale_value != null
                              ? `${(it.sale_value > 0 ? "+" : "")}${moneyFmt(it.sale_value)}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : null}
          </div>
        ) : null}

        {revisionActive ? (
        <>
        {/* Scan + manual add */}
        <div className="mb-4 flex flex-col gap-2 rounded-2xl bg-white p-4 shadow md:flex-row">
          <button
            type="button"
            className="rounded-xl bg-primary px-4 py-3 font-semibold text-white"
            onClick={() => {
              setScannerSession((s) => s + 1);
              setRevisionScannerOn(true);
            }}
          >
            📷 Сканировать товар
          </button>
          <input
            value={revisionSearch}
            onChange={(e) => setRevisionSearch(e.target.value)}
            placeholder="Поиск по названию"
            className="min-h-11 flex-1 rounded-xl border px-3 py-2"
          />
        </div>

        {/* Scanned products */}
        <div className="mb-4 rounded-2xl bg-white p-4 shadow">
          <h2 className="mb-2 text-lg font-semibold">Просканировано ({scannedRows.length})</h2>
          {scannedRows.length === 0 ? (
            <p className="text-sm text-slate-500">Пока ничего не отсканировано. Нажмите «Сканировать товар» или найдите вручную.</p>
          ) : (
            <div className="space-y-2">
              {scannedRows.map((row) => {
                const actual = Number(revisionFactual[row.id] ?? 0);
                const diff = actual - row.balance;
                const bg = diff === 0 ? "bg-slate-50" : diff > 0 ? "bg-emerald-50" : "bg-red-50";
                return (
                  <div key={row.id} className={`grid grid-cols-1 gap-2 rounded-xl border p-3 md:grid-cols-5 ${bg}`}>
                    <p className="font-medium md:col-span-2">{row.name}</p>
                    <p className="text-sm">Система: <b>{row.balance}</b></p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Факт:</span>
                      <NumberInput
                        className="h-9 w-20 rounded-lg border px-2 text-right"
                        value={String(actual)}
                        onChange={(value) => setRevisionFactual((prev) => ({ ...prev, [row.id]: Math.max(0, Math.floor(Number(value) || 0)) }))}
                      />
                      <button
                        type="button"
                        className="text-sm text-red-600"
                        onClick={() => {
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
                        }}
                        title="Убрать из ревизии (вернёт остаток как был)"
                      >
                        ✕
                      </button>
                    </div>
                    <p className={`text-sm font-semibold ${diff === 0 ? "text-slate-500" : diff > 0 ? "text-emerald-700" : "text-red-700"}`}>
                      {diff === 0 ? "OK" : diff > 0 ? `+${diff}` : `${diff}`}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Missing (not yet scanned) */}
        <div className="mb-4 rounded-2xl bg-white p-4 shadow">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setRevisionShowMissing((v) => !v)}
          >
            <h2 className="text-lg font-semibold">
              Не просканировано ({missingRows.length})
            </h2>
            <span className="text-sm text-slate-500">{revisionShowMissing ? "скрыть" : "показать"}</span>
          </button>
          {revisionShowMissing ? (
            <>
              <p className="mt-2 text-sm text-slate-500">
                Поставьте галочку <b>«Это недостача»</b> там, где товара физически нет (списать в 0).
                Без галочки товар останется как есть (считаем что забыли просканировать).
              </p>
              <div className="mt-3 space-y-1">
                {filteredMissingRows.map((row) => {
                  const isMissing = !!revisionMissing[row.id];
                  return (
                    <label key={row.id} className={`flex items-center justify-between gap-3 rounded-lg border p-2 ${isMissing ? "bg-red-50 border-red-200" : ""}`}>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{row.name}</p>
                        <p className="text-xs text-slate-500">Система: {row.balance} шт</p>
                      </div>
                      <span className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={isMissing}
                          onChange={(e) => setRevisionMissing((prev) => ({ ...prev, [row.id]: e.target.checked }))}
                        />
                        Это недостача
                      </span>
                    </label>
                  );
                })}
                {filteredMissingRows.length === 0 ? (
                  <p className="text-sm text-slate-500">Все товары обработаны или не подходят под фильтр.</p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        <button
          type="button"
          disabled={finishRevisionMutation.isPending || changesCount === 0}
          className="w-full rounded-xl bg-success px-5 py-3 text-lg font-semibold text-white disabled:opacity-50 md:w-auto"
          onClick={() => finishRevisionMutation.mutate()}
        >
          {finishRevisionMutation.isPending ? "Сохранение…" : `Завершить ревизию${changesCount ? ` (${changesCount})` : ""}`}
        </button>

        {revisionScannerOn ? (
          <BarcodeScanner
            onDetected={addByBarcode}
            onClose={() => setRevisionScannerOn(false)}
          />
        ) : null}
        </>
        ) : null}
      </main>
    );
  }

  return (
    <main>
      {message ? (
        <div
          className={`mb-3 rounded-xl px-4 py-3 text-sm text-white ${
            message.startsWith("✓") ? "bg-emerald-600" : "bg-slate-900"
          }`}
        >
          {message}
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-2 rounded-2xl bg-white p-4 shadow md:flex-row md:flex-wrap md:items-stretch">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию товара"
          className="min-h-11 min-w-0 w-full flex-1 rounded-xl border px-3 py-2 md:min-w-[12rem]"
        />
        <button type="button" className={`${stockToolbarBtn} bg-primary text-white`} onClick={() => openInModal()}>
          Приход
        </button>
        <button
          type="button"
          className={`${stockToolbarBtn} border border-primary text-primary`}
          onClick={() => openInModal(undefined, { newProductOnly: true })}
        >
          Новый товар
        </button>
        <button type="button" className={`${stockToolbarBtn} border`} onClick={() => openOutModal()}>
          Расход / списание
        </button>
        <button type="button" className={`${stockToolbarBtn} border`} onClick={() => setMode("revision")}>
          Ревизия
        </button>
        <button type="button" className={`${stockToolbarBtn} border`} onClick={() => setShowReturnModal(true)}>
          Возврат
        </button>
        <button
          type="button"
          className={`${stockToolbarBtn} border`}
          onClick={() => {
            setScanContext("header");
            setScannerSession((s) => s + 1);
            setShowScanner(true);
          }}
        >
          Сканировать
        </button>
        <button
          type="button"
          className={`${stockToolbarBtn} ${barcodeSelectMode ? "bg-amber-500 text-white" : "border"}`}
          onClick={() => {
            setBarcodeSelectMode((v) => !v);
            setSelectedForBarcode(new Set());
          }}
        >
          {barcodeSelectMode ? "Отменить выбор" : "Печать штрихкодов"}
        </button>
        {barcodeSelectMode && selectedForBarcode.size > 0 ? (
          <button
            type="button"
            className={`${stockToolbarBtn} bg-success text-white`}
            onClick={() => void printBarcodesBatch(Array.from(selectedForBarcode))}
          >
            🖨 Распечатать ({selectedForBarcode.size})
          </button>
        ) : null}
      </div>

      {hasExpiryDate && expiringSoonCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpiringOnly((v) => !v)}
          className={`mb-3 block w-full rounded-xl px-4 py-2 text-left text-sm ${
            expiringOnly ? "bg-amber-200 text-amber-900" : "bg-amber-50 text-amber-800 hover:bg-amber-100"
          }`}
        >
          ⚠️ {expiringSoonCount} {expiringSoonCount === 1 ? "товар истекает" : "товара(-ов) истекают"} в ближайшие 3 дня
          {expiringOnly ? " — фильтр включён (нажмите чтобы выключить)" : " — нажмите чтобы показать только их"}
        </button>
      ) : null}

      <div className="rounded-2xl bg-white p-4 shadow">
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                {barcodeSelectMode ? (
                  <th className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={rows.length > 0 && rows.every((r) => selectedForBarcode.has(r.id))}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedForBarcode(new Set(rows.map((r) => r.id)));
                        else setSelectedForBarcode(new Set());
                      }}
                    />
                  </th>
                ) : null}
                <th className="px-2 py-2">Название</th>
                <th className="px-2 py-2">Штрихкод</th>
                {isGrocery ? <th className="px-2 py-2">Поставщик</th> : null}
                <th className="px-2 py-2">Остаток</th>
                <th className="px-2 py-2">Мин.остаток</th>
                {hasExpiryDate ? <th className="px-2 py-2">Срок</th> : null}
                {isOwner ? <th className="px-2 py-2">Цена закупки</th> : null}
                <th className="px-2 py-2">Цена продажи</th>
                {isOwner ? <th className="px-2 py-2">Маржа %</th> : null}
                <th className="px-2 py-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const low = row.balance < row.min_stock;
                const equal = row.balance === row.min_stock;
                const checked = selectedForBarcode.has(row.id);
                const expiry = hasExpiryDate ? expiryInfo(row.id) : null;
                return (
                  <tr
                    key={row.id}
                    className={`cursor-pointer border-b ${low ? "bg-red-50" : equal ? "bg-yellow-50" : ""}`}
                    onClick={() => {
                      if (barcodeSelectMode) {
                        setSelectedForBarcode((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.id)) next.delete(row.id);
                          else next.add(row.id);
                          return next;
                        });
                      } else {
                        openProductCard(row);
                      }
                    }}
                  >
                    {barcodeSelectMode ? (
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedForBarcode((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(row.id);
                              else next.delete(row.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                    ) : null}
                    <td className="px-2 py-2 font-medium">{row.name}</td>
                    <td className="px-2 py-2 font-mono text-xs">{row.barcode || "-"}</td>
                    {isGrocery ? (
                      <td className="px-2 py-2 text-sm text-slate-700">
                        {(() => {
                          const prod = products.find((p) => p.id === row.id);
                          const sup = (suppliersQuery.data ?? []).find(
                            (s) => s.id === (prod?.supplier_id ?? -1),
                          );
                          return sup ? sup.name : <span className="text-slate-400">—</span>;
                        })()}
                      </td>
                    ) : null}
                    <td className="px-2 py-2 font-semibold">{row.balance}</td>
                    <td className="px-2 py-2">{row.min_stock}</td>
                    {hasExpiryDate ? (
                      <td className="px-2 py-2">
                        {expiry ? (
                          <span className={`rounded-full px-2 py-1 text-xs ${expiry.classes}`}>
                            {expiry.label}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    ) : null}
                    {isOwner ? <td className="px-2 py-2">{Number(row.purchase_price || 0).toFixed(2)}</td> : null}
                    <td className="px-2 py-2">{Number(row.sale_price || 0).toFixed(2)}</td>
                    {isOwner ? (
                      <td className="px-2 py-2">
                        {row.margin_pct != null ? (
                          <span className={
                            row.margin_pct >= 30 ? "text-emerald-700 font-semibold" :
                            row.margin_pct >= 10 ? "text-slate-700" :
                            row.margin_pct >= 0  ? "text-amber-700" :
                                                   "text-rose-700 font-semibold"
                          }>
                            {row.margin_pct.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    ) : null}
                    <td className="px-2 py-2">
                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <button className="rounded-md border px-2 py-1" onClick={() => openInModal(row.id)}>
                          Приход
                        </button>
                        <button className="rounded-md border px-2 py-1" onClick={() => openOutModal(row.id)}>
                          Расход
                        </button>
                        <button className="rounded-md border px-2 py-1" onClick={() => printBarcode(row)}>
                          Штрихкод
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <section className="mt-5 rounded-2xl bg-white p-4 shadow">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 className="text-xl font-semibold">История движений (всего {allFilteredMovements.length})</h2>
          <select
            className="h-10 rounded-lg border px-3"
            value={movementFilter}
            onChange={(e) => {
              setMovementFilter(e.target.value);
              setMovementsPage(1);
            }}
          >
            <option value="">Все типы</option>
            <option value="in">Приход/Возврат</option>
            <option value="out">Расход</option>
            <option value="writeoff">Списание</option>
          </select>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="px-2 py-2">Дата</th>
                <th className="px-2 py-2">Товар</th>
                <th className="px-2 py-2">Тип</th>
                <th className="px-2 py-2">Кол-во</th>
                <th className="px-2 py-2">Кто сделал</th>
              </tr>
            </thead>
            <tbody>
              {filteredMovements.map((m) => {
                const p = products.find((x) => x.id === m.product_id);
                return (
                  <tr key={m.id} className="border-b">
                    <td className="px-2 py-2">{m.created_at ? new Date(m.created_at).toLocaleString() : "-"}</td>
                    <td className="px-2 py-2">{p?.name || `#${m.product_id}`}</td>
                    <td className="px-2 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          m.type === "in"
                            ? "bg-emerald-100 text-emerald-700"
                            : m.type === "writeoff"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {MOVEMENT_TYPE_LABEL[m.type] ?? m.type}
                      </span>
                    </td>
                    <td className="px-2 py-2">{m.quantity}</td>
                    <td className="px-2 py-2">{m.created_by_name || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {movementsTotalPages > 1 ? (
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border px-3 py-1 text-sm disabled:opacity-50"
              disabled={currentMovementsPage <= 1}
              onClick={() => setMovementsPage((p) => Math.max(1, p - 1))}
            >
              Назад
            </button>
            <span className="text-sm text-slate-600">
              {currentMovementsPage} / {movementsTotalPages}
            </span>
            <button
              type="button"
              className="rounded-lg border px-3 py-1 text-sm disabled:opacity-50"
              disabled={currentMovementsPage >= movementsTotalPages}
              onClick={() => setMovementsPage((p) => Math.min(movementsTotalPages, p + 1))}
            >
              Вперёд
            </button>
          </div>
        ) : null}
      </section>

      {selectedProduct ? (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-auto border-l bg-white p-5 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-2xl font-semibold">{selectedProduct.name}</h3>
            <button className="rounded-lg border px-3 py-1" onClick={() => setSelectedProduct(null)}>
              Закрыть
            </button>
          </div>
          <div className="space-y-2 text-sm">
            <p><b>Штрихкод:</b> {selectedProduct.barcode || "Нет"}</p>
            <p><b>Мин. остаток:</b> {selectedProduct.min_stock ?? 0}</p>
            <p><b>Цена продажи:</b> {Number(selectedProduct.sale_price || 0).toFixed(2)}</p>
            {isOwner ? <p><b>Цена закупки:</b> {Number(selectedProduct.purchase_price || 0).toFixed(2)}</p> : null}
            <p><b>Гарантия:</b> {selectedProduct.warranty_months ?? 0} мес.</p>
            <p><b>Описание:</b> {selectedProduct.description || "-"}</p>
          </div>

          <div className="mt-5 rounded-xl border p-3">
            <h4 className="mb-2 font-semibold">Штрихкод</h4>
            {selectedProduct.barcode ? (
              <div className="space-y-2">
                {barcodePreviewLoading ? (
                  <p className="text-sm text-slate-500">Загрузка штрихкода…</p>
                ) : barcodePreviewUrl ? (
                  <img src={barcodePreviewUrl} alt="barcode" className="max-h-24 w-full rounded bg-white object-contain" />
                ) : (
                  <p className="text-sm text-red-600">Не удалось загрузить штрихкод</p>
                )}
                <button
                  type="button"
                  className="rounded-lg bg-primary px-3 py-2 text-white disabled:opacity-50"
                  disabled={barcodePreviewLoading || !barcodePreviewUrl}
                  onClick={() => void printBarcode(selectedProduct)}
                >
                  Распечатать штрихкод
                </button>
              </div>
            ) : (
              <button
                className="rounded-lg bg-primary px-3 py-2 text-white"
                onClick={() => generateBarcodeMutation.mutate(selectedProduct.id)}
              >
                Сгенерировать штрихкод
              </button>
            )}
          </div>

          <div className="mt-5 rounded-xl border p-3">
            <h4 className="mb-2 font-semibold">История движений (10)</h4>
            <div className="space-y-2 text-sm">
              {selectedProductMovements.map((m) => (
                <div key={m.id} className="rounded-lg border p-2">
                  <p>{MOVEMENT_TYPE_LABEL[m.type] ?? m.type} · {m.quantity}</p>
                  <p className="text-xs text-slate-500">{m.created_at ? new Date(m.created_at).toLocaleString() : "-"}</p>
                </div>
              ))}
              {!selectedProductMovements.length ? <p className="text-slate-500">Движения не найдены</p> : null}
            </div>
          </div>

          <button className="mt-5 rounded-xl border px-4 py-2">Редактировать товар</button>
        </div>
      ) : null}

      {showInModal ? (
        <div className={modalOverlay}>
          <div className={modalCard}>
            <h3 className="mb-4 text-xl font-semibold">
              {inReceiptMode === "create" ? "Новый товар и приход" : "Приход товара"}
            </h3>
            {inReceiptMode === "create" ? (
              <>
                <button
                  type="button"
                  className="mb-3 text-sm font-medium text-primary hover:underline"
                  onClick={() => {
                    setInReceiptMode("existing");
                    setInModalError("");
                  }}
                >
                  ← К поиску товара
                </button>
                <p className="mb-2 text-sm font-semibold text-slate-800">Новый товар</p>
                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs text-slate-500">Название</label>
                    <input
                      className="w-full rounded-lg border px-3 py-2"
                      value={newProductName}
                      onChange={(e) => setNewProductName(e.target.value)}
                      placeholder="Название"
                    />
                  </div>
                  {!isGrocery ? (
                    <div>
                      <label className="mb-1 block text-xs text-slate-500">Гарантия (мес.)</label>
                      <NumberInput
                        className="w-full rounded-lg border px-3 py-2"
                        value={newProductWarranty}
                        onChange={setNewProductWarranty}
                      />
                    </div>
                  ) : null}
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Минимальный остаток</label>
                    <NumberInput
                      className="w-full rounded-lg border px-3 py-2"
                      value={newProductMinStock}
                      onChange={setNewProductMinStock}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs text-slate-500">Штрихкод</label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                      <input
                        className="w-full flex-1 rounded-lg border px-3 py-2 font-mono sm:min-w-0"
                        disabled={useAutoBarcode}
                        value={useAutoBarcode ? "" : newCardBarcode}
                        onChange={(e) => {
                          setNewCardBarcode(e.target.value);
                          setUseAutoBarcode(false);
                        }}
                        placeholder={useAutoBarcode ? "Будет сгенерирован при сохранении" : "Штрихкод"}
                      />
                      <button
                        type="button"
                        className="shrink-0 rounded-lg border border-primary px-3 py-2 text-sm text-primary"
                        onClick={() => {
                          setUseAutoBarcode(true);
                          setNewCardBarcode("");
                        }}
                      >
                        Сгенерировать автоматически
                      </button>
                    </div>
                  </div>

                  {isGrocery ? (
                    <>
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs text-slate-500">Категория</label>
                        <input
                          className="w-full rounded-lg border px-3 py-2"
                          value={newProductCategory}
                          onChange={(e) => setNewProductCategory(e.target.value)}
                          placeholder="Например, Молочные продукты"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-slate-500">Тип товара</label>
                        <select
                          className="w-full rounded-lg border bg-white px-3 py-2"
                          value={newProductKind}
                          onChange={(e) => {
                            const k = e.target.value as "piece" | "weighed" | "volume";
                            setNewProductKind(k);
                            setNewProductUnit(k === "piece" ? "шт" : k === "weighed" ? "кг" : "л");
                          }}
                        >
                          <option value="piece">Штучный</option>
                          <option value="weighed">Весовой</option>
                          <option value="volume">Объёмный</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-slate-500">Единица</label>
                        <select
                          className="w-full rounded-lg border bg-white px-3 py-2"
                          value={newProductUnit}
                          onChange={(e) => setNewProductUnit(e.target.value)}
                        >
                          {["шт", "кг", "г", "л", "мл", "уп", "пачка", "рул"].map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                      {newProductKind === "weighed" ? (
                        <div className="md:col-span-2">
                          <label className="mb-1 block text-xs text-slate-500">PLU / Код весов</label>
                          <input
                            className="w-full rounded-lg border px-3 py-2 font-mono"
                            value={newProductPlu}
                            onChange={(e) => setNewProductPlu(e.target.value)}
                            inputMode="numeric"
                            pattern="\d+"
                            placeholder="12345"
                          />
                        </div>
                      ) : null}
                      <div>
                        <label className="mb-1 block text-xs text-slate-500">Срок хранения (дней)</label>
                        <NumberInput
                          className="w-full rounded-lg border px-3 py-2"
                          value={newProductShelfLife}
                          onChange={setNewProductShelfLife}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-slate-500">Температурный режим</label>
                        <select
                          className="w-full rounded-lg border bg-white px-3 py-2"
                          value={newProductStorageTemp}
                          onChange={(e) => setNewProductStorageTemp(e.target.value)}
                        >
                          <option value="">— не указан —</option>
                          <option value="ambient">Комнатная (15-25°C)</option>
                          <option value="cool">Прохладное место</option>
                          <option value="refrigerated">Холодильник (+2..+8°C)</option>
                          <option value="frozen">Заморозка (-18°C)</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs text-slate-500">Поставщик</label>
                        <input
                          className="w-full rounded-lg border px-3 py-2"
                          list="stock-newproduct-suppliers"
                          value={newProductManufacturer}
                          onChange={(e) => setNewProductManufacturer(e.target.value)}
                          placeholder="Начни вводить имя поставщика…"
                        />
                        <datalist id="stock-newproduct-suppliers">
                          {(suppliersQuery.data ?? []).map((s) => (
                            <option key={s.id} value={s.name} />
                          ))}
                        </datalist>
                        <p className="mt-1 text-xs text-slate-500">
                          Если такого поставщика нет — добавь его в разделе «Поставщики»,
                          иначе он просто не привяжется к товару.
                        </p>
                      </div>
                    </>
                  ) : null}
                </div>
                <p className="mb-2 text-sm font-semibold text-slate-800">Приход</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Количество</label>
                    <div className={`flex items-center gap-2 rounded-lg border px-2 py-2 ${inQtyInvalid ? "border-red-500" : ""}`}>
                      <button type="button" className="h-9 w-9 rounded-md border" onClick={() => setQty(String(Math.max(1, Number(qty || 1) - 1)))}>−</button>
                      <NumberInput
                        className="w-full border-0 text-center text-2xl outline-none"
                        value={qty}
                        onChange={(value) => {
                          const next = Math.min(9999, Math.max(1, Number(value || 1)));
                          setQty(String(next));
                        }}
                        placeholder="1"
                      />
                      <button type="button" className="h-9 w-9 rounded-md border" onClick={() => setQty(String(Math.min(9999, Number(qty || 1) + 1)))}>+</button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Цена закупки (за ед.)</label>
                    <NumberInput className="w-full rounded-lg border px-3 py-2" value={purchasePrice} onChange={setPurchasePrice} placeholder="Цена закупки (за ед.)" />
                    <p className="mt-2 text-sm font-medium text-slate-700">Итого к оприходованию: {incomingTotal.toFixed(2)} сом</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Розничная цена (за ед.)</label>
                    <NumberInput
                      className="w-full rounded-lg border px-3 py-2"
                      value={retailPrice}
                      onChange={setRetailPrice}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Дата прихода</label>
                    <input type="date" className="w-full rounded-lg border px-3 py-2" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs text-slate-500">Комментарий</label>
                    <input className="w-full rounded-lg border px-3 py-2" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Комментарий" />
                  </div>
                </div>
              </>
            ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="relative md:col-span-2">
                <label className="mb-1 block text-xs text-slate-500">Товар</label>
                <div className="flex gap-2">
                  <input
                    value={inProductSearch}
                    onChange={(e) => {
                      setInProductSearch(e.target.value);
                      setSelectedProductId("");
                      setInModalScanInfo(null);
                      setBarcodeMiss(null);
                    }}
                    placeholder="Поиск товара..."
                    className={`h-11 flex-1 rounded-lg border px-3 py-2 ${
                      inProductInvalid
                        ? "border-red-500"
                        : showNameMissOffer || showBarcodeMissOffer
                          ? "border-amber-300 bg-amber-50/40"
                          : ""
                    }`}
                  />
                  <button
                    className="h-11 rounded-lg border px-3"
                    onClick={() => {
                      if (isDesktop) {
                        setInManualMode(true);
                        return;
                      }
                      setInModalScanning(true);
                    }}
                  >
                    Сканировать
                  </button>
                </div>
                {inManualMode ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={inManualBarcode}
                      onChange={(e) => setInManualBarcode(e.target.value)}
                      placeholder="Введите штрихкод вручную"
                      className="h-11 flex-1 rounded-lg border px-3 py-2"
                    />
                    <button
                      className="rounded-lg border px-3"
                      onClick={() => {
                        void (async () => {
                          const found = await findProductByBarcode(inManualBarcode.trim());
                          if (found) {
                            setSelectedProductId(found.id);
                            setInProductSearch(found.name);
                            setPurchasePrice(String(found.purchase_price ?? 0));
                            setRetailPrice(String(found.sale_price ?? 0));
                            setInModalScanInfo({ ok: true, text: `✓ Найден: ${found.name}` });
                          } else {
                            setInModalScanInfo(null);
                            setBarcodeMiss(inManualBarcode.trim());
                          }
                        })();
                      }}
                    >
                      Найти
                    </button>
                  </div>
                ) : null}
                {inModalScanning ? (
                  <div className="mt-3 rounded-xl border p-2">
                    <BarcodeScanner
                      embedded
                      onDetected={(code) => {
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
                      }}
                      onClose={() => setInModalScanning(false)}
                    />
                    <button className="mt-2 w-full rounded-lg border px-3 py-2" onClick={() => setInModalScanning(false)}>
                      Отмена сканирования
                    </button>
                  </div>
                ) : null}
                {showInProductDropdown ? (
                  <div className="absolute left-0 right-0 top-12 z-20 max-h-60 overflow-auto rounded-lg border bg-white shadow">
                    {(inModalProductsQuery.data ?? []).map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        className="flex w-full items-center justify-between border-b px-3 py-2 text-left last:border-b-0"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSelectedProductId(p.id);
                          setInProductSearch(p.name);
                          setPurchasePrice(formatMoneyFromApi(p.purchase_price));
                          setRetailPrice(formatMoneyFromApi(p.sale_price));
                          setInModalScanInfo({ ok: true, text: `✓ Найден: ${p.name}` });
                          setInModalError("");
                        }}
                      >
                        <span>{p.name}</span>
                        <span className="text-xs text-slate-500">Остаток: {stockMap.get(p.id) ?? 0}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {inModalScanInfo?.ok ? (
                  <p className="mt-2 text-sm text-emerald-600">
                    {inModalScanInfo.text}
                    {(selectedStockProduct as any)?.weighing_code
                      ? ` · PLU: ${(selectedStockProduct as any).weighing_code}`
                      : (selectedStockProduct as any)?.kind === "weighed"
                        ? " · PLU не задан"
                        : ""}
                  </p>
                ) : null}
                {showBarcodeMissOffer ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-slate-800">
                    <p>
                      Товар со штрихкодом <span className="font-mono font-semibold">{barcodeMiss}</span> не найден в каталоге.
                    </p>
                    <button
                      type="button"
                      className="mt-3 w-full rounded-lg bg-primary px-3 py-2.5 text-center text-sm text-white sm:w-auto"
                      onClick={() => {
                        setInReceiptMode("create");
                        setNewCardBarcode(barcodeMiss ?? "");
                        setNewProductName("");
                        setUseAutoBarcode(false);
                        setBarcodeMiss(null);
                      }}
                    >
                      + Создать новый товар с этим штрихкодом и оприходовать
                    </button>
                  </div>
                ) : showNameMissOffer ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-slate-800">
                    <p>Товар «{qSearch}» не найден в каталоге.</p>
                    <button
                      type="button"
                      className="mt-3 w-full rounded-lg bg-primary px-3 py-2.5 text-center text-sm text-white sm:w-auto"
                      onClick={() => {
                        setInReceiptMode("create");
                        setNewProductName(qSearch);
                        setNewCardBarcode("");
                        setUseAutoBarcode(false);
                      }}
                    >
                      + Создать новый товар «{qSearch}» и оприходовать
                    </button>
                  </div>
                ) : null}
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Количество</label>
                <div className={`flex items-center gap-2 rounded-lg border px-2 py-2 ${inQtyInvalid ? "border-red-500" : ""}`}>
                  <button className="h-9 w-9 rounded-md border" onClick={() => setQty(String(Math.max(1, Number(qty || 1) - 1)))}>−</button>
                  <NumberInput
                    className="w-full border-0 text-center text-2xl outline-none"
                    value={qty}
                    onChange={(value) => {
                      const next = Math.min(9999, Math.max(1, Number(value || 1)));
                      setQty(String(next));
                    }}
                    placeholder="1"
                  />
                  <button className="h-9 w-9 rounded-md border" onClick={() => setQty(String(Math.min(9999, Number(qty || 1) + 1)))}>+</button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Цена закупки (за ед.)</label>
                <NumberInput className="w-full rounded-lg border px-3 py-2" value={purchasePrice} onChange={setPurchasePrice} placeholder="Цена закупки (за ед.)" />
                <p className="mt-2 text-sm font-medium text-slate-700">Итого к оприходованию: {incomingTotal.toFixed(2)} сом</p>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Розничная цена (за ед.)</label>
                <NumberInput
                  className="w-full rounded-lg border px-3 py-2"
                  value={retailPrice}
                  onChange={setRetailPrice}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Дата прихода</label>
                <input type="date" className="w-full rounded-lg border px-3 py-2" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-slate-500">Комментарий</label>
                <input className="w-full rounded-lg border px-3 py-2" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Комментарий" />
              </div>
              {isGrocery ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Дата производства</label>
                    <input
                      type="date"
                      className="w-full rounded-lg border px-3 py-2"
                      value={productionDate}
                      onChange={(e) => {
                        const value = e.target.value;
                        setProductionDate(value);
                        const sel = products.find((p) => p.id === Number(selectedProductId));
                        if (value && sel?.shelf_life_days) {
                          const d = new Date(value + "T00:00:00");
                          d.setDate(d.getDate() + sel.shelf_life_days);
                          setExpiryDate(d.toISOString().slice(0, 10));
                        }
                      }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Дата истечения</label>
                    <input type="date" className="w-full rounded-lg border px-3 py-2" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Номер партии</label>
                    <input className="w-full rounded-lg border px-3 py-2" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="Batch #" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Поставщик</label>
                    <input
                      className="w-full rounded-lg border px-3 py-2"
                      value={supplierIn}
                      onChange={(e) => setSupplierIn(e.target.value)}
                      list="suppliers-list"
                      placeholder="Выберите или введите нового"
                      onBlur={async () => {
                        const value = supplierIn.trim();
                        if (!value) return;
                        const exists = (suppliersQuery.data ?? []).some((s) => s.name === value);
                        if (!exists && isOwner) {
                          try {
                            await api.post("/suppliers", { name: value });
                            await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
                          } catch {
                            // тихо — не блокируем приход если не дали роль
                          }
                        }
                      }}
                    />
                    <datalist id="suppliers-list">
                      {(suppliersQuery.data ?? []).map((s) => (
                        <option key={s.id} value={s.name} />
                      ))}
                    </datalist>
                  </div>
                </>
              ) : null}
            </div>
            )}
            {inModalError ? <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{inModalError}</div> : null}
            <div className="mt-4 flex gap-2">
              {inReceiptMode === "create" ? (
                <button
                  type="button"
                  disabled={createProductAndReceiptMutation.isPending}
                  className="rounded-xl bg-primary px-4 py-2 text-white disabled:opacity-60"
                  onClick={() => {
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
                  }}
                >
                  {createProductAndReceiptMutation.isPending ? "Сохранение…" : "Сохранить"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={movementMutation.isPending}
                  className="rounded-xl bg-primary px-4 py-2 text-white disabled:opacity-60"
                  onClick={async () => {
                    setInFormTouched(true);
                    const resolvedId = resolveIncomingProductId();
                    if (resolvedId) {
                      setSelectedProductId(resolvedId);
                    }
                    const productId = resolvedId ?? (selectedProductId !== "" ? Number(selectedProductId) : NaN);
                    if (!Number.isFinite(productId) || productId < 1 || Number(qty) < 1) {
                      setInModalError(
                        "Выберите товар из списка или создайте новый товар по кнопке ниже. Количество должно быть от 1 до 9999.",
                      );
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
                      } catch (error) {
                        setInModalError(extractAxiosDetail(error));
                        return;
                      }
                    }
                    const supTrim = supplierIn.trim();
                    const supId = supTrim
                      ? (suppliersQuery.data ?? []).find((s) => s.name === supTrim)?.id ?? null
                      : null;
                    const isWeighed = (selected as any)?.kind === "weighed";
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
                  }}
                >
                  {movementMutation.isPending ? "Сохранение…" : "Сохранить"}
                </button>
              )}
              <button type="button" className="rounded-xl border px-4 py-2" onClick={() => setShowInModal(false)}>Отмена</button>
            </div>
          </div>
        </div>
      ) : null}

      {showOutModal ? (
        <div className={modalOverlay}>
          <div className={modalCard}>
            <h3 className="mb-4 text-xl font-semibold">Расход / Списание</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="relative md:col-span-2">
                <div className="flex gap-2">
                  <input
                    className="h-11 flex-1 rounded-lg border px-3 py-2"
                    value={outProductSearch}
                    onChange={(e) => {
                      setOutProductSearch(e.target.value);
                      setSelectedProductId("");
                    }}
                    placeholder="Поиск товара..."
                  />
                  <button
                    className="h-11 rounded-lg border px-3"
                    onClick={() => {
                      if (isDesktop) {
                        setOutManualMode(true);
                        return;
                      }
                      setOutModalScanning(true);
                    }}
                  >
                    Сканировать
                  </button>
                </div>
                {outManualMode ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={outManualBarcode}
                      onChange={(e) => setOutManualBarcode(e.target.value)}
                      placeholder="Введите штрихкод вручную"
                      className="h-11 flex-1 rounded-lg border px-3 py-2"
                    />
                    <button
                      className="rounded-lg border px-3"
                      onClick={() => {
                        void (async () => {
                          const found = await findProductByBarcode(outManualBarcode.trim());
                          if (found) {
                            setSelectedProductId(found.id);
                            setOutProductSearch(found.name);
                            setOutModalError("");
                          } else {
                            setOutModalError(`Штрихкод ${outManualBarcode.trim()} не найден в каталоге`);
                          }
                        })();
                      }}
                    >
                      Найти
                    </button>
                  </div>
                ) : null}
                {outModalScanning ? (
                  <div className="mt-3 rounded-xl border p-2">
                    <BarcodeScanner
                      embedded
                      onDetected={(code) => {
                        return (async () => {
                          const found = await findProductByBarcode(code);
                          if (found) {
                            setSelectedProductId(found.id);
                            setOutProductSearch(found.name);
                            setOutModalScanning(false);
                            return { ok: true, message: `✓ Найден: ${found.name}`, autoClose: true };
                          } else {
                            setMessage("Товар не найден по штрихкоду");
                            return { ok: false, message: `✗ Не найден: ${code}`, autoClose: false };
                          }
                        })();
                      }}
                      onClose={() => setOutModalScanning(false)}
                    />
                    <button className="mt-2 w-full rounded-lg border px-3 py-2" onClick={() => setOutModalScanning(false)}>
                      Отмена сканирования
                    </button>
                  </div>
                ) : null}
                {showOutProductDropdown ? (
                  <div className="absolute left-0 right-0 top-12 z-20 max-h-60 overflow-auto rounded-lg border bg-white shadow">
                    {(outModalProductsQuery.data ?? []).map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        className="flex w-full items-center justify-between border-b px-3 py-2 text-left last:border-b-0"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSelectedProductId(p.id);
                          setOutProductSearch(p.name);
                          setOutModalError("");
                        }}
                      >
                        <span>{p.name}</span>
                        <span className="text-xs text-slate-500">Остаток: {stockMap.get(p.id) ?? 0}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <NumberInput className="rounded-lg border px-3 py-2" value={qty} onChange={setQty} placeholder="Количество" />
              <select
                className="rounded-lg border bg-white px-3 py-2"
                value={outType}
                onChange={(e) => setOutType(e.target.value)}
              >
                <option value="expired">⏰ Просрочка</option>
                <option value="damaged">💥 Порча / бой</option>
                <option value="theft">🚫 Кража / недостача</option>
                <option value="own_use">🏠 Внутреннее использование</option>
                <option value="return_to_supplier">↩️ Возврат поставщику</option>
                <option value="other">📦 Другое</option>
              </select>
              <input type="date" className="rounded-lg border px-3 py-2" value={movementDate} onChange={(e) => setMovementDate(e.target.value)} />
              <input className="rounded-lg border px-3 py-2 md:col-span-2" value={outReason} onChange={(e) => setOutReason(e.target.value)} placeholder="Комментарий (необязательно)" />
            </div>
            {outModalError ? <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{outModalError}</div> : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={movementMutation.isPending}
                className="rounded-xl bg-primary px-4 py-2 text-white disabled:opacity-60"
                onClick={() => {
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
                }}
              >
                {movementMutation.isPending ? "Сохранение…" : "Сохранить"}
              </button>
              <button className="rounded-xl border px-4 py-2" onClick={() => setShowOutModal(false)}>Отмена</button>
            </div>
          </div>
        </div>
      ) : null}

      {showReturnModal ? (
        <div className={modalOverlay}>
          <div className={modalCard}>
            <div className="mb-3 flex items-start justify-between">
              <h3 className="text-xl font-semibold">Возврат товара</h3>
              <button className="text-2xl text-slate-500" onClick={() => {
                setShowReturnModal(false);
                setReturnProduct(null);
                setReturnProductSearch("");
                setSelectedSale(null);
                setReturnSelectedItems([]);
              }}>×</button>
            </div>

            {!returnProduct ? (
              <>
                <p className="mb-2 text-sm text-slate-500">Найдите товар, который клиент хочет вернуть</p>
                <input
                  className="mb-3 w-full rounded-lg border px-3 py-2"
                  value={returnProductSearch}
                  onChange={(e) => setReturnProductSearch(e.target.value)}
                  placeholder="Поиск по названию или штрихкоду"
                  autoFocus
                />
                <div className="max-h-72 overflow-auto rounded-lg border">
                  {products
                    .filter((p) => {
                      const q = returnProductSearch.trim().toLowerCase();
                      if (!q) return false;
                      return (
                        p.name.toLowerCase().includes(q) ||
                        (p.barcode || "").includes(q)
                      );
                    })
                    .slice(0, 30)
                    .map((p) => (
                      <button
                        key={p.id}
                        className="block w-full border-b px-3 py-2 text-left hover:bg-slate-50"
                        onClick={() => {
                          setReturnProduct(p);
                          setSelectedSale(null);
                          setReturnSelectedItems([]);
                        }}
                      >
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-slate-500">{p.barcode || "—"}</p>
                      </button>
                    ))}
                  {returnProductSearch.trim() && (products ?? []).filter((p) => p.name.toLowerCase().includes(returnProductSearch.trim().toLowerCase()) || (p.barcode || "").includes(returnProductSearch.trim())).length === 0 ? (
                    <p className="p-3 text-sm text-slate-500">Товар не найден</p>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between rounded-lg bg-slate-50 p-3">
                  <div>
                    <p className="text-sm text-slate-500">Возвращаем товар:</p>
                    <p className="font-semibold">{returnProduct.name}</p>
                  </div>
                  <button className="text-sm text-primary" onClick={() => { setReturnProduct(null); setSelectedSale(null); setReturnSelectedItems([]); }}>
                    ← Сменить товар
                  </button>
                </div>

                {salesByProductQuery.isLoading ? (
                  <p className="text-sm text-slate-500">Поиск продаж...</p>
                ) : (salesByProductQuery.data ?? []).length === 0 ? (
                  <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                    Этот товар нигде не продавался (или все продажи уже возвращены)
                  </p>
                ) : (
                  <>
                    <p className="mb-2 text-sm text-slate-500">
                      Выберите продажу (по дате — от свежих к старым):
                    </p>
                    <div className="mb-3 max-h-72 space-y-2 overflow-auto">
                      {(salesByProductQuery.data ?? []).map((sale) => {
                        const isSelected = selectedSale?.id === sale.id;
                        const dt = sale.created_at ? new Date(sale.created_at).toLocaleString() : "—";
                        return (
                          <div key={sale.id} className={`rounded-lg border ${isSelected ? "border-primary bg-indigo-50" : ""}`}>
                            <button
                              className="block w-full p-3 text-left"
                              onClick={() => {
                                setSelectedSale(sale);
                                setReturnSelectedItems([]);
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">Продажа #{sale.id}</p>
                                  <p className="text-xs text-slate-500">{dt}</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-semibold">{Number(sale.total ?? 0).toFixed(2)} сом</p>
                                  {sale.customer_name ? <p className="text-xs text-slate-500">{sale.customer_name}</p> : null}
                                </div>
                              </div>
                            </button>
                            {isSelected && sale.items?.length ? (
                              <div className="border-t bg-white p-3">
                                <p className="mb-2 text-xs text-slate-500">Отметьте позиции для возврата:</p>
                                <div className="space-y-1">
                                  {sale.items.map((item) => {
                                    const checked = returnSelectedItems.includes(item.id);
                                    const isOurProduct = item.product_id === returnProduct.id;
                                    return (
                                      <label key={item.id} className={`flex items-center gap-2 rounded-md p-2 ${isOurProduct ? "bg-amber-50" : ""}`}>
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() =>
                                            setReturnSelectedItems((prev) =>
                                              checked ? prev.filter((x) => x !== item.id) : [...prev, item.id],
                                            )
                                          }
                                        />
                                        <span className="flex-1 text-sm">
                                          {item.product_name || `Товар #${item.product_id}`}
                                          {isOurProduct ? <span className="ml-1 text-xs text-amber-700">← искомый</span> : null}
                                        </span>
                                        <span className="text-sm font-medium">
                                          {item.quantity} × {Number(item.price).toFixed(2)}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    {selectedSale ? (
                      <>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <input
                            className="rounded-lg border px-3 py-2 md:col-span-2"
                            value={returnReason}
                            onChange={(e) => setReturnReason(e.target.value)}
                            placeholder="Причина возврата (необязательно)"
                          />
                          <select className="rounded-lg border px-3 py-2" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
                            <option value="cash">Возврат наличными</option>
                            <option value="card">Возврат на карту</option>
                            <option value="transfer">Возврат переводом</option>
                          </select>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <button
                            className="rounded-xl bg-primary px-4 py-2 text-white disabled:opacity-50"
                            disabled={!returnSelectedItems.length || returnMutation.isPending}
                            onClick={() => returnMutation.mutate()}
                          >
                            {returnMutation.isPending ? "Сохранение..." : `Оформить возврат (${returnSelectedItems.length})`}
                          </button>
                          <button className="rounded-xl border px-4 py-2" onClick={() => { setSelectedSale(null); setReturnSelectedItems([]); }}>
                            Сбросить выбор
                          </button>
                        </div>
                      </>
                    ) : null}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}

      {showScanner ? (
        <BarcodeScanner key={scannerSession} onDetected={onScanned} onClose={() => setShowScanner(false)} />
      ) : null}

      {scanActionProduct ? (
        <div className={modalOverlay}>
          <div className="mx-auto mt-20 max-w-md rounded-2xl bg-white p-5">
            <h3 className="mb-2 text-lg font-semibold">Товар найден: {scanActionProduct.name}</h3>
            <div className="flex flex-wrap gap-2">
              <button className="rounded-lg bg-primary px-3 py-2 text-white" onClick={() => { openInModal(scanActionProduct.id); setScanActionProduct(null); }}>Приход</button>
              <button className="rounded-lg border px-3 py-2" onClick={() => { openOutModal(scanActionProduct.id); setScanActionProduct(null); }}>Расход</button>
              <button className="rounded-lg border px-3 py-2" onClick={() => { openProductCard(scanActionProduct); setScanActionProduct(null); }}>Карточка</button>
              <button className="rounded-lg border px-3 py-2" onClick={() => setScanActionProduct(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
