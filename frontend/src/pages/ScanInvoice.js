import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, RotateCcw, ScanLine, Trash2, Upload, X } from "lucide-react";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";
import { useBusinessSettings } from "../hooks/useBusinessSettings";
// Парсер чисел с поддержкой запятой как десятичного разделителя.
// Anthropic / накладные / русская раскладка — везде запятая. Number("27,8") = NaN.
function parseNum(v) {
    if (v === null || v === undefined || v === "")
        return 0;
    const n = Number(String(v).replace(",", ".").trim());
    return Number.isFinite(n) ? n : 0;
}
export function ScanInvoicePage() {
    const role = useAuthStore((s) => s.role);
    const { hasInvoiceScan } = useBusinessSettings();
    const qc = useQueryClient();
    const fileInputRef = useRef(null);
    const [file, setFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [supplier, setSupplier] = useState("");
    const [invoiceNumber, setInvoiceNumber] = useState("");
    const [invoiceDate, setInvoiceDate] = useState("");
    const [rows, setRows] = useState([]);
    const [error, setError] = useState(null);
    const [saveProgress, setSaveProgress] = useState(null);
    // id строки, для которой сейчас открыт сканер штрихкода. null — закрыт.
    const [scanningRowId, setScanningRowId] = useState(null);
    // Если у магазина фича не подключена — отправляем подальше.
    if (!hasInvoiceScan) {
        return _jsx(Navigate, { to: "/sale", replace: true });
    }
    if (role !== "owner" && role !== "warehouse") {
        return _jsx(Navigate, { to: "/sale", replace: true });
    }
    const productsQuery = useQuery({
        queryKey: ["products-all"],
        queryFn: async () => (await api.get("/products")).data,
    });
    const quotaQuery = useQuery({
        queryKey: ["scan-quota"],
        queryFn: async () => (await api.get("/scan/quota")).data,
    });
    const handleFile = (f) => {
        setError(null);
        setRows([]);
        setSupplier("");
        setInvoiceNumber("");
        setInvoiceDate("");
        if (!f) {
            setFile(null);
            setPreviewUrl(null);
            return;
        }
        if (!f.type.startsWith("image/")) {
            setError("Нужно изображение (jpg, png, webp)");
            return;
        }
        if (f.size > 5 * 1024 * 1024) {
            setError("Файл больше 5 МБ");
            return;
        }
        setFile(f);
        setPreviewUrl(URL.createObjectURL(f));
    };
    const scanMutation = useMutation({
        mutationFn: async () => {
            if (!file)
                throw new Error("no file");
            const formData = new FormData();
            formData.append("file", file);
            const res = await api.post("/scan/invoice", formData, {
                headers: { "Content-Type": "multipart/form-data" },
                timeout: 120000,
            });
            return res.data;
        },
        onSuccess: (data) => {
            setError(null);
            qc.invalidateQueries({ queryKey: ["scan-quota"] });
            setSupplier(data.supplier ?? "");
            setInvoiceNumber(data.invoice_number ?? "");
            setInvoiceDate(data.invoice_date ?? "");
            // Сразу пытаемся найти товар по штрихкоду в нашей базе.
            const products = productsQuery.data ?? [];
            const byBarcode = new Map();
            for (const p of products) {
                if (p.barcode)
                    byBarcode.set(p.barcode, p);
            }
            setRows((data.items ?? []).map((it, idx) => {
                const matched = it.barcode ? byBarcode.get(it.barcode) : undefined;
                return {
                    id: `${Date.now()}-${idx}`,
                    name: it.name ?? "",
                    barcode: it.barcode ?? "",
                    quantity: String(it.quantity ?? 0),
                    price: String(it.price ?? 0),
                    matched_product_id: matched ? matched.id : null,
                };
            }));
        },
        onError: (err) => {
            const detail = err.response?.data?.detail;
            setError(detail ?? "Не удалось распознать накладную");
        },
    });
    const updateRow = (id, patch) => {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    };
    const removeRow = (id) => setRows((prev) => prev.filter((r) => r.id !== id));
    // При изменении штрихкода — пытаемся снова найти товар.
    const onBarcodeBlur = (id, barcode) => {
        const products = productsQuery.data ?? [];
        const matched = barcode ? products.find((p) => p.barcode === barcode) : null;
        updateRow(id, { matched_product_id: matched ? matched.id : null });
    };
    const acceptMutation = useMutation({
        mutationFn: async () => {
            let createdMovements = 0;
            const failed = [];
            const succeededIds = [];
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                setSaveProgress(`Сохраняю ${i + 1} / ${rows.length}: ${row.name}…`);
                const qty = parseNum(row.quantity);
                const price = parseNum(row.price);
                if (qty <= 0) {
                    failed.push({ id: row.id, row: i + 1, name: row.name, reason: "количество = 0" });
                    continue;
                }
                if (price <= 0) {
                    failed.push({ id: row.id, row: i + 1, name: row.name, reason: "цена = 0" });
                    continue;
                }
                try {
                    let productId = row.matched_product_id;
                    // Если товар не найден — создаём новый. barcode обязательный для нового товара,
                    // но мы можем сгенерировать (barcode_generated=true) если у юзера его нет.
                    if (!productId) {
                        const productPayload = {
                            name: row.name || `Товар (без названия) ${i + 1}`,
                            sale_price: price, // дефолт = закупочная, юзер исправит позже
                            purchase_price: price,
                        };
                        if (row.barcode) {
                            productPayload.barcode = row.barcode;
                        }
                        else {
                            productPayload.barcode_generated = true;
                        }
                        const created = (await api.post("/products", productPayload)).data;
                        productId = created.id;
                    }
                    // Если товар весовой — кол-во из накладной (например 27.8 кг) шлём в quantity_decimal,
                    // иначе теряли бы дробную часть и склад отъезжал.
                    const matchedProd = (productsQuery.data ?? []).find((p) => p.id === productId);
                    const isWeighed = matchedProd?.kind === "weighed";
                    await api.post("/stock/movement", {
                        product_id: productId,
                        quantity: isWeighed ? 0 : Math.max(1, Math.round(qty)),
                        quantity_decimal: isWeighed ? qty : null,
                        type: "in",
                        cost_price: price,
                        reason: `Приход по накладной${invoiceNumber ? " #" + invoiceNumber : ""}${supplier ? ", " + supplier : ""}`,
                        supplier: supplier || null,
                    });
                    createdMovements++;
                    succeededIds.push(row.id);
                }
                catch (err) {
                    const detail = err.response?.data?.detail;
                    failed.push({ id: row.id, row: i + 1, name: row.name, reason: detail ?? "ошибка сохранения" });
                }
            }
            return { createdMovements, failed, succeededIds };
        },
        onSuccess: ({ createdMovements, failed, succeededIds }) => {
            setSaveProgress(null);
            setError(null);
            qc.invalidateQueries({ queryKey: ["products-all"] });
            qc.invalidateQueries({ queryKey: ["stock-summary"] });
            // Удаляем успешно сохранённые строки — чтобы повтор не создавал дублей.
            setRows((prev) => prev.filter((r) => !succeededIds.includes(r.id)));
            const okMsg = `✅ Принято в приход: ${createdMovements} позиций.`;
            if (failed.length === 0) {
                alert(okMsg);
                reset();
            }
            else {
                const lines = failed.map((f) => `  • «${f.name}» — ${f.reason}`).join("\n");
                alert(`${okMsg}\n\n⚠️ Не сохранены ${failed.length} позиций (исправь и нажми ещё раз):\n${lines}`);
            }
        },
        onError: (err) => {
            setSaveProgress(null);
            const detail = err.response?.data?.detail;
            setError(detail ?? "Не удалось сохранить приход");
        },
    });
    const reset = () => {
        setFile(null);
        setPreviewUrl(null);
        setSupplier("");
        setInvoiceNumber("");
        setInvoiceDate("");
        setRows([]);
        setError(null);
        setSaveProgress(null);
        if (fileInputRef.current)
            fileInputRef.current.value = "";
    };
    const totalSum = rows.reduce((acc, r) => acc + parseNum(r.quantity) * parseNum(r.price), 0);
    return (_jsxs("div", { className: "mx-auto max-w-6xl", children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(ScanLine, { size: 22, className: "text-primary" }), _jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-slate-800", children: "\u0421\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u043D\u0430\u043A\u043B\u0430\u0434\u043D\u043E\u0439" }), _jsx("p", { className: "text-sm text-slate-500", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u0438 \u0444\u043E\u0442\u043E \u2014 \u0418\u0418 \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0435\u0442 \u043F\u043E\u0437\u0438\u0446\u0438\u0438, \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0448\u044C \u0438 \u043E\u0434\u043D\u043E\u0439 \u043A\u043D\u043E\u043F\u043A\u043E\u0439 \u043F\u0440\u0438\u043C\u0435\u0448\u044C \u0432 \u043F\u0440\u0438\u0445\u043E\u0434." })] })] }), quotaQuery.data ? ((() => {
                        const { used, limit } = quotaQuery.data;
                        const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
                        const danger = used >= limit;
                        const warn = used >= limit * 0.8 && used < limit;
                        return (_jsxs("div", { className: `min-w-[200px] rounded-xl border p-2 text-xs ${danger ? "border-red-300 bg-red-50" : warn ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`, children: [_jsxs("p", { className: "mb-1", children: [_jsx("b", { children: used }), " / ", limit, " \u0441\u043A\u0430\u043D\u043E\u0432 \u0432 \u044D\u0442\u043E\u043C \u043C\u0435\u0441\u044F\u0446\u0435"] }), _jsx("div", { className: "h-1.5 overflow-hidden rounded-full bg-slate-200", children: _jsx("div", { className: `h-full ${danger ? "bg-red-500" : warn ? "bg-amber-500" : "bg-emerald-500"}`, style: { width: `${pct}%` } }) }), danger ? (_jsx("p", { className: "mt-1 text-[10px] text-red-700", children: "\u041B\u0438\u043C\u0438\u0442 \u0438\u0441\u0447\u0435\u0440\u043F\u0430\u043D \u2014 \u043E\u0431\u0440\u0430\u0442\u0438\u0441\u044C \u043A \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0443 \u043F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u044B" })) : null] }));
                    })()) : null] }), error ? (_jsx("div", { className: "mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700", children: error })) : null, _jsxs("div", { className: "grid gap-4 md:grid-cols-[320px_1fr]", children: [_jsxs("div", { className: "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm", children: [!previewUrl ? (_jsxs("div", { onDragOver: (e) => e.preventDefault(), onDrop: (e) => {
                                    e.preventDefault();
                                    const f = e.dataTransfer.files[0];
                                    handleFile(f);
                                }, onClick: () => fileInputRef.current?.click(), className: "flex h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-primary hover:text-primary", children: [_jsx(Upload, { size: 32, className: "mb-2" }), _jsx("p", { className: "text-sm font-semibold", children: "\u0412\u044B\u0431\u0435\u0440\u0438 \u0438\u043B\u0438 \u043F\u0435\u0440\u0435\u0442\u0430\u0449\u0438 \u0444\u043E\u0442\u043E" }), _jsx("p", { className: "mt-1 text-xs", children: "JPG, PNG, WEBP \u2014 \u0434\u043E 5 \u041C\u0411" })] })) : (_jsxs("div", { children: [_jsx("img", { src: previewUrl, alt: "\u043D\u0430\u043A\u043B\u0430\u0434\u043D\u0430\u044F", className: "max-h-[420px] w-full rounded-xl object-contain" }), _jsxs("button", { type: "button", onClick: reset, className: "mt-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700", children: [_jsx(X, { size: 14 }), " \u0423\u0431\u0440\u0430\u0442\u044C \u0444\u043E\u0442\u043E"] })] })), _jsx("input", { ref: fileInputRef, type: "file", accept: "image/*", className: "hidden", onChange: (e) => handleFile(e.target.files?.[0] ?? null) }), _jsxs("button", { type: "button", onClick: () => scanMutation.mutate(), disabled: !file || scanMutation.isPending, className: "mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60", children: [_jsx(Camera, { size: 16 }), scanMutation.isPending ? "Распознаём…" : "Распознать накладную"] })] }), _jsx("div", { className: "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm", children: rows.length === 0 ? (_jsx("p", { className: "py-12 text-center text-sm text-slate-500", children: scanMutation.isPending ? "Распознаём накладную, может занять до минуты…" : "После распознавания позиции появятся здесь." })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mb-3 grid gap-2 sm:grid-cols-3", children: [_jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1 block text-xs text-slate-500", children: "\u041F\u043E\u0441\u0442\u0430\u0432\u0449\u0438\u043A" }), _jsx("input", { value: supplier, onChange: (e) => setSupplier(e.target.value), placeholder: "\u2014", className: "h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1 block text-xs text-slate-500", children: "\u2116 \u043D\u0430\u043A\u043B\u0430\u0434\u043D\u043E\u0439" }), _jsx("input", { value: invoiceNumber, onChange: (e) => setInvoiceNumber(e.target.value), placeholder: "\u2014", className: "h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1 block text-xs text-slate-500", children: "\u0414\u0430\u0442\u0430" }), _jsx("input", { type: "date", value: invoiceDate, onChange: (e) => setInvoiceDate(e.target.value), className: "h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" })] })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500", children: _jsxs("tr", { children: [_jsx("th", { className: "px-2 py-2", children: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435" }), _jsx("th", { className: "px-2 py-2", children: "\u0428\u0442\u0440\u0438\u0445\u043A\u043E\u0434" }), _jsx("th", { className: "px-2 py-2 text-right", children: "\u041A\u043E\u043B-\u0432\u043E" }), _jsx("th", { className: "px-2 py-2 text-right", children: "\u0426\u0435\u043D\u0430" }), _jsx("th", { className: "px-2 py-2 text-right", children: "\u0421\u0443\u043C\u043C\u0430" }), _jsx("th", { className: "px-2 py-2" })] }) }), _jsx("tbody", { children: rows.map((row) => (_jsxs("tr", { className: "border-t", children: [_jsxs("td", { className: "px-1 py-1", children: [_jsx("input", { value: row.name, onChange: (e) => updateRow(row.id, { name: e.target.value }), className: "h-8 w-full rounded border border-slate-300 px-2 text-sm" }), row.matched_product_id ? (_jsx("span", { className: "ml-1 text-[10px] text-emerald-600", children: "\u2713 \u0435\u0441\u0442\u044C \u0432 \u0431\u0430\u0437\u0435" })) : (_jsx("span", { className: "ml-1 text-[10px] text-amber-600", children: "+ \u0441\u043E\u0437\u0434\u0430\u0441\u0442\u0441\u044F \u043D\u043E\u0432\u044B\u0439" }))] }), _jsx("td", { className: "px-1 py-1", children: _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("input", { value: row.barcode, onChange: (e) => updateRow(row.id, { barcode: e.target.value }), onBlur: (e) => onBarcodeBlur(row.id, e.target.value.trim()), placeholder: "\u2014", className: "h-8 w-28 rounded border border-slate-300 px-2 font-mono text-xs" }), _jsx("button", { type: "button", onClick: () => setScanningRowId(row.id), className: "flex h-8 w-8 items-center justify-center rounded border border-slate-300 text-slate-500 hover:border-primary hover:text-primary", title: "\u0421\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434 \u043A\u0430\u043C\u0435\u0440\u043E\u0439", children: _jsx(Camera, { size: 14 }) })] }) }), _jsx("td", { className: "px-1 py-1 text-right", children: _jsx("input", { type: "text", inputMode: "decimal", value: row.quantity, onChange: (e) => updateRow(row.id, { quantity: e.target.value }), className: "h-8 w-20 rounded border border-slate-300 px-2 text-right tabular-nums" }) }), _jsx("td", { className: "px-1 py-1 text-right", children: _jsx("input", { type: "text", inputMode: "decimal", value: row.price, onChange: (e) => updateRow(row.id, { price: e.target.value }), className: "h-8 w-24 rounded border border-slate-300 px-2 text-right tabular-nums" }) }), _jsx("td", { className: "px-2 py-1 text-right tabular-nums font-semibold", children: (parseNum(row.quantity) * parseNum(row.price)).toFixed(2) }), _jsx("td", { className: "px-1 py-1", children: _jsx("button", { type: "button", onClick: () => removeRow(row.id), className: "rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600", title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u0442\u0440\u043E\u043A\u0443", children: _jsx(Trash2, { size: 14 }) }) })] }, row.id))) }), _jsx("tfoot", { children: _jsxs("tr", { className: "border-t bg-slate-50", children: [_jsx("td", { colSpan: 4, className: "px-2 py-2 text-right text-sm font-semibold text-slate-700", children: "\u0418\u0422\u041E\u0413\u041E" }), _jsx("td", { className: "px-2 py-2 text-right tabular-nums text-base font-bold", children: totalSum.toFixed(2) }), _jsx("td", {})] }) })] }) }), saveProgress ? (_jsx("p", { className: "mt-2 text-xs text-slate-500", children: saveProgress })) : null, _jsxs("div", { className: "mt-4 flex flex-wrap gap-2", children: [_jsxs("button", { type: "button", onClick: () => acceptMutation.mutate(), disabled: acceptMutation.isPending || rows.length === 0, className: "inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60", children: [_jsx(Check, { size: 16 }), acceptMutation.isPending ? "Сохраняю…" : "Принять в приход"] }), _jsxs("button", { type: "button", onClick: reset, className: "inline-flex items-center gap-1 rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50", children: [_jsx(RotateCcw, { size: 16 }), " \u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C"] })] })] })) })] }), scanningRowId !== null ? (_jsx("div", { className: "fixed inset-0 z-[80] bg-black", children: _jsx(BarcodeScanner, { onDetected: (code) => {
                        const trimmed = (code || "").trim();
                        if (!trimmed)
                            return { ok: false, message: "Пустой код", autoClose: false };
                        const products = productsQuery.data ?? [];
                        const matched = products.find((p) => p.barcode === trimmed);
                        updateRow(scanningRowId, {
                            barcode: trimmed,
                            matched_product_id: matched ? matched.id : null,
                        });
                        setScanningRowId(null);
                        return matched
                            ? { ok: true, message: `✓ Найден: ${matched.name}`, autoClose: true }
                            : { ok: true, message: `✓ ${trimmed} (создастся новый товар)`, autoClose: true };
                    }, onClose: () => setScanningRowId(null) }) })) : null] }));
}
