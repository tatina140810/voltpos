import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NumberInput } from "../components/NumberInput";
import { GroceryProductForm, groceryEmptyForm } from "../components/grocery/GroceryProductForm";
import { useBusinessSettings } from "../hooks/useBusinessSettings";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";
const emptyForm = {
    name: "",
    description: "",
    sale_price: "",
    purchase_price: "",
    warranty_months: "12",
    min_stock: "",
    barcode: "",
    extra_barcodes: "",
    kind: "piece",
    unit: "",
    weighing_code: "",
};
function parseExtraBarcodes(raw) {
    return raw
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}
export function ProductsPage() {
    const role = useAuthStore((s) => s.role);
    const isOwner = role === "owner";
    const queryClient = useQueryClient();
    const { type: businessType } = useBusinessSettings();
    const isGrocery = businessType === "grocery";
    const [search, setSearch] = useState("");
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [showEditor, setShowEditor] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [groceryForm, setGroceryForm] = useState(groceryEmptyForm);
    const [showStockIn, setShowStockIn] = useState(false);
    const [stockProduct, setStockProduct] = useState(null);
    const [stockQty, setStockQty] = useState("1");
    const [stockPurchasePrice, setStockPurchasePrice] = useState("");
    const [stockSupplier, setStockSupplier] = useState("");
    const [stockExpiryDate, setStockExpiryDate] = useState("");
    const [stockBatch, setStockBatch] = useState("");
    const [message, setMessage] = useState("");
    const suppliersQuery = useQuery({
        queryKey: ["suppliers"],
        queryFn: async () => (await api.get("/suppliers")).data,
    });
    const productsQuery = useQuery({
        queryKey: ["products-all"],
        queryFn: async () => (await api.get("/products")).data,
    });
    const orgQuery = useQuery({
        queryKey: ["org-me"],
        queryFn: async () => (await api.get("/org/me")).data,
    });
    const orgHasWeighed = orgQuery.data?.has_weighed_products ?? false;
    const stockQuery = useQuery({
        queryKey: ["stock"],
        queryFn: async () => (await api.get("/stock")).data,
    });
    const saveProductMutation = useMutation({
        mutationFn: async () => {
            let payload;
            if (isGrocery) {
                payload = {
                    name: groceryForm.name,
                    description: groceryForm.description || null,
                    category: groceryForm.category || null,
                    sale_price: Number(groceryForm.sale_price || 0),
                    purchase_price: Number(groceryForm.purchase_price || 0),
                    warranty_months: 0,
                    min_stock: Number(groceryForm.min_stock || 0),
                    barcode: groceryForm.barcode || null,
                    kind: groceryForm.kind,
                    unit: groceryForm.unit || null,
                    weighing_code: groceryForm.weighing_code || null,
                    shelf_life_days: groceryForm.shelf_life_days ? Number(groceryForm.shelf_life_days) : null,
                    storage_temp: groceryForm.storage_temp || null,
                    country_of_origin: groceryForm.country_of_origin || null,
                    manufacturer: groceryForm.manufacturer || null,
                    vat_rate: Number(groceryForm.vat_rate || 0),
                    min_days_before_expiry: Number(groceryForm.min_days_before_expiry || 0),
                    promo_price: groceryForm.promo_price ? Number(groceryForm.promo_price) : null,
                    promo_until_date: groceryForm.promo_until_date || null,
                    storage_location: groceryForm.storage_location || null,
                    supplier_id: groceryForm.supplier_id ?? null,
                };
            }
            else {
                payload = {
                    name: form.name,
                    description: form.description || null,
                    sale_price: Number(form.sale_price || 0),
                    purchase_price: Number(form.purchase_price || 0),
                    warranty_months: Number(form.warranty_months || 0),
                    min_stock: Number(form.min_stock || 0),
                    barcode: form.barcode || null,
                    extra_barcodes: parseExtraBarcodes(form.extra_barcodes),
                };
                if (orgHasWeighed) {
                    payload.kind = form.kind;
                    payload.unit = form.unit || null;
                    payload.weighing_code = form.kind === "weighed" ? form.weighing_code || null : null;
                }
            }
            if (editingProduct) {
                await api.put(`/products/${editingProduct.id}`, payload);
            }
            else {
                await api.post("/products", payload);
            }
        },
        onSuccess: async () => {
            setShowEditor(false);
            setEditingProduct(null);
            setForm(emptyForm);
            setGroceryForm(groceryEmptyForm);
            await queryClient.invalidateQueries({ queryKey: ["products-all"] });
            setMessage("Товар сохранён");
        },
        onError: () => setMessage("Не удалось сохранить товар"),
    });
    const generateBarcodeMutation = useMutation({
        mutationFn: async (productId) => {
            const response = await api.get(`/products/${productId}/barcode`);
            return response.data;
        },
        onSuccess: (data) => {
            const barcode = data.barcode ?? data.code ?? "";
            setForm((prev) => ({ ...prev, barcode }));
            setMessage(barcode ? "Штрихкод сгенерирован" : "Штрихкод получен");
        },
        onError: () => setMessage("Не удалось сгенерировать штрихкод"),
    });
    const stockInMutation = useMutation({
        mutationFn: async () => {
            if (!stockProduct)
                return;
            const supTrim = isGrocery ? stockSupplier.trim() : "";
            const supId = supTrim
                ? (suppliersQuery.data ?? []).find((s) => s.name === supTrim)?.id ?? null
                : null;
            // Если поставщика ввели вручную — создадим его (тихо). Только для grocery.
            if (isGrocery && supTrim && !supId && isOwner) {
                try {
                    await api.post("/suppliers", { name: supTrim });
                    await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
                }
                catch {
                    // не блокируем приход
                }
            }
            const isWeighed = stockProduct?.kind === "weighed";
            const qtyNum = Number(stockQty || 0);
            await api.post("/stock/movement", {
                product_id: stockProduct.id,
                quantity: isWeighed ? 0 : Math.floor(qtyNum),
                quantity_decimal: isWeighed ? Number(qtyNum.toFixed(3)) : null,
                type: "in",
                cost_price: Number(stockPurchasePrice || 0) || null,
                ...(isGrocery
                    ? {
                        supplier: supTrim || null,
                        supplier_id: supId,
                        expiry_date: stockExpiryDate || null,
                        batch_number: stockBatch.trim() || null,
                    }
                    : {}),
            });
        },
        onSuccess: async () => {
            setShowStockIn(false);
            setStockProduct(null);
            setStockQty("1");
            setStockPurchasePrice("");
            setStockSupplier("");
            setStockExpiryDate("");
            setStockBatch("");
            await queryClient.invalidateQueries({ queryKey: ["stock"] });
            await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
            setMessage("Приход сохранён");
        },
        onError: () => setMessage("Не удалось сохранить приход"),
    });
    const products = productsQuery.data ?? [];
    const stock = stockQuery.data ?? [];
    const stockByProduct = useMemo(() => new Map(stock.map((row) => [row.product_id, row.balance])), [stock]);
    const rows = useMemo(() => products
        .map((product) => ({ ...product, balance: stockByProduct.get(product.id) ?? 0 }))
        .filter((product) => product.name.toLowerCase().includes(search.toLowerCase())), [products, stockByProduct, search]);
    const openCreate = () => {
        setEditingProduct(null);
        setForm(emptyForm);
        setGroceryForm(groceryEmptyForm);
        setShowEditor(true);
    };
    const openEdit = (product) => {
        setEditingProduct(product);
        setForm({
            name: product.name ?? "",
            description: product.description ?? "",
            sale_price: String(product.sale_price ?? 0),
            purchase_price: String(product.purchase_price ?? 0),
            warranty_months: String(product.warranty_months ?? 0),
            min_stock: String(product.min_stock ?? 0),
            barcode: product.barcode ?? "",
            extra_barcodes: (product.extra_barcodes ?? []).join(", "),
            kind: (product.kind ?? "piece"),
            unit: product.unit ?? "",
            weighing_code: product.weighing_code ?? "",
        });
        setGroceryForm({
            name: product.name ?? "",
            category: product.category ?? "",
            barcode: product.barcode ?? "",
            weighing_code: product.weighing_code ?? "",
            kind: (product.kind ?? "piece"),
            unit: product.unit ?? "шт",
            sale_price: String(product.sale_price ?? 0),
            purchase_price: String(product.purchase_price ?? 0),
            vat_rate: String(product.vat_rate ?? 0),
            promo_price: product.promo_price != null ? String(product.promo_price) : "",
            promo_until_date: product.promo_until_date ?? "",
            shelf_life_days: product.shelf_life_days != null ? String(product.shelf_life_days) : "",
            min_days_before_expiry: String(product.min_days_before_expiry ?? 0),
            storage_temp: product.storage_temp ?? "",
            manufacturer: product.manufacturer ?? "",
            country_of_origin: product.country_of_origin ?? "",
            supplier_id: product.supplier_id ?? null,
            supplier_name: (suppliersQuery.data ?? []).find((s) => s.id === (product.supplier_id ?? -1))?.name ?? "",
            min_stock: String(product.min_stock ?? 1),
            storage_location: product.storage_location ?? "",
            description: product.description ?? "",
        });
        setShowEditor(true);
    };
    return (_jsxs("main", { children: [_jsxs("div", { className: "mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between", children: [_jsx("h1", { className: "text-3xl font-semibold", children: "\u0422\u043E\u0432\u0430\u0440\u044B" }), _jsx("button", { onClick: openCreate, className: "rounded-xl bg-primary px-4 py-3 text-white", children: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0442\u043E\u0432\u0430\u0440" })] }), _jsxs("div", { className: "rounded-2xl bg-white p-4 shadow", children: [_jsx("input", { value: search, onChange: (e) => setSearch(e.target.value), placeholder: "\u041F\u043E\u0438\u0441\u043A \u043F\u043E \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044E", className: "mb-4 w-full rounded-xl border p-3" }), _jsxs("div", { className: "overflow-auto", children: [_jsxs("table", { className: "min-w-full text-left text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b text-slate-500", children: [_jsx("th", { className: "px-2 py-2", children: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435" }), isOwner ? _jsx("th", { className: "px-2 py-2", children: "\u0417\u0430\u043A\u0443\u043F\u043A\u0430" }) : null, _jsx("th", { className: "px-2 py-2", children: "\u0426\u0435\u043D\u0430 \u043F\u0440\u043E\u0434\u0430\u0436\u0438" }), _jsx("th", { className: "px-2 py-2", children: "\u041E\u0441\u0442\u0430\u0442\u043E\u043A" }), _jsx("th", { className: "px-2 py-2", children: "\u0413\u0430\u0440\u0430\u043D\u0442\u0438\u044F" }), _jsx("th", { className: "px-2 py-2", children: "\u0428\u0442\u0440\u0438\u0445\u043A\u043E\u0434" }), _jsx("th", { className: "px-2 py-2", children: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" })] }) }), _jsx("tbody", { children: rows.map((row, idx) => (_jsxs("tr", { className: idx % 2 ? "bg-slate-50" : "", children: [_jsx("td", { className: "px-2 py-2", children: _jsx("button", { onClick: () => setSelectedProduct(row), className: "text-left font-medium text-primary", children: row.name }) }), isOwner ? _jsx("td", { className: "px-2 py-2", children: Number(row.purchase_price ?? 0).toFixed(2) }) : null, _jsx("td", { className: "px-2 py-2", children: Number(row.sale_price ?? 0).toFixed(2) }), _jsx("td", { className: "px-2 py-2 font-semibold", children: row.balance }), _jsxs("td", { className: "px-2 py-2", children: [row.warranty_months ?? 0, " \u043C\u0435\u0441"] }), _jsx("td", { className: "px-2 py-2", children: row.barcode ?? "-" }), _jsx("td", { className: "px-2 py-2", children: _jsx("button", { className: "rounded-lg border px-2 py-1 text-xs", onClick: () => {
                                                            setStockProduct(row);
                                                            setShowStockIn(true);
                                                        }, children: "\u041F\u0440\u0438\u0445\u043E\u0434" }) })] }, row.id))) })] }), !rows.length ? _jsx("p", { className: "p-4 text-sm text-slate-500", children: "\u0422\u043E\u0432\u0430\u0440\u044B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B" }) : null] })] }), message ? _jsx("p", { className: "mt-3 text-sm text-amber-700", children: message }) : null, selectedProduct ? (_jsx("div", { className: "fixed inset-0 z-40 bg-black/20", children: _jsxs("div", { className: "ml-auto h-full w-full max-w-md overflow-auto bg-white p-4 shadow-2xl", children: [_jsxs("div", { className: "mb-3 flex items-start justify-between", children: [_jsx("h2", { className: "text-xl font-semibold", children: selectedProduct.name }), _jsx("button", { onClick: () => setSelectedProduct(null), className: "text-slate-500", children: "\u2715" })] }), _jsxs("div", { className: "space-y-2 text-sm", children: [_jsxs("p", { children: ["\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435: ", selectedProduct.description ?? "-"] }), _jsxs("p", { children: ["\u0426\u0435\u043D\u0430 \u043F\u0440\u043E\u0434\u0430\u0436\u0438: ", Number(selectedProduct.sale_price ?? 0).toFixed(2), " \u0441\u043E\u043C"] }), isOwner ? (_jsxs("p", { children: ["\u0417\u0430\u043A\u0443\u043F\u043E\u0447\u043D\u0430\u044F \u0446\u0435\u043D\u0430: ", Number(selectedProduct.purchase_price ?? 0).toFixed(2), " \u0441\u043E\u043C"] })) : null, _jsxs("p", { children: ["\u0413\u0430\u0440\u0430\u043D\u0442\u0438\u044F: ", selectedProduct.warranty_months ?? 0, " \u043C\u0435\u0441"] }), _jsxs("p", { children: ["\u041C\u0438\u043D. \u043E\u0441\u0442\u0430\u0442\u043E\u043A: ", selectedProduct.min_stock ?? 0] }), _jsxs("p", { children: ["\u0428\u0442\u0440\u0438\u0445\u043A\u043E\u0434: ", selectedProduct.barcode ?? "-"] })] }), _jsxs("div", { className: "mt-4 flex gap-2", children: [_jsx("button", { className: "flex-1 rounded-xl bg-primary p-3 text-white", onClick: () => {
                                        openEdit(selectedProduct);
                                        setSelectedProduct(null);
                                    }, children: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C" }), _jsx("button", { className: "flex-1 rounded-xl border p-3", children: "\u0420\u0430\u0441\u043F\u0435\u0447\u0430\u0442\u0430\u0442\u044C \u0446\u0435\u043D\u043D\u0438\u043A" })] })] }) })) : null, showEditor && isGrocery ? (_jsx("div", { className: "fixed inset-0 z-40 overflow-auto bg-black/40 p-4", children: _jsx("div", { className: "mx-auto max-w-3xl", children: _jsx(GroceryProductForm, { title: editingProduct ? "Редактирование товара" : "Новый товар", form: groceryForm, setForm: setGroceryForm, categories: [], units: ["шт", "кг", "г", "л", "мл", "уп", "пачка", "рул"], suppliers: (suppliersQuery.data ?? []), onGenerateBarcode: editingProduct
                            ? () => generateBarcodeMutation.mutate(editingProduct.id)
                            : undefined, onSave: () => saveProductMutation.mutate(), onCancel: () => setShowEditor(false), isSaving: saveProductMutation.isPending }) }) })) : null, showEditor && !isGrocery ? (_jsx("div", { className: "fixed inset-0 z-40 bg-black/40 p-4", children: _jsxs("div", { className: "mx-auto max-h-[95vh] max-w-2xl overflow-auto rounded-2xl bg-white p-4", children: [_jsx("h2", { className: "mb-3 text-xl font-semibold", children: editingProduct ? "Редактирование товара" : "Новый товар" }), _jsxs("div", { className: "grid gap-3 md:grid-cols-2", children: [_jsx("input", { className: "rounded-xl border p-3 md:col-span-2", placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", value: form.name, onChange: (e) => setForm((prev) => ({ ...prev, name: e.target.value })) }), _jsx("input", { className: "rounded-xl border p-3 md:col-span-2", placeholder: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435", value: form.description, onChange: (e) => setForm((prev) => ({ ...prev, description: e.target.value })) }), _jsx(NumberInput, { className: "rounded-xl border p-3", placeholder: form.kind === "weighed" ? "Цена за 1 кг" : "Цена продажи", value: form.sale_price, onChange: (value) => setForm((prev) => ({ ...prev, sale_price: value })) }), orgHasWeighed ? (_jsxs("div", { className: "md:col-span-2 grid gap-3 rounded-xl border bg-slate-50 p-3 md:grid-cols-3", children: [_jsxs("label", { className: "text-sm", children: [_jsx("span", { className: "mb-1 block text-xs text-slate-600", children: "\u0422\u0438\u043F \u0442\u043E\u0432\u0430\u0440\u0430" }), _jsxs("select", { className: "w-full rounded-lg border bg-white p-2", value: form.kind, onChange: (e) => setForm((prev) => ({ ...prev, kind: e.target.value })), children: [_jsx("option", { value: "piece", children: "\u0428\u0442\u0443\u0447\u043D\u044B\u0439" }), _jsx("option", { value: "weighed", children: "\u0412\u0435\u0441\u043E\u0432\u043E\u0439" })] })] }), form.kind === "weighed" ? (_jsxs(_Fragment, { children: [_jsxs("label", { className: "text-sm", children: [_jsx("span", { className: "mb-1 block text-xs text-slate-600", children: "\u0415\u0434\u0438\u043D\u0438\u0446\u0430" }), _jsxs("select", { className: "w-full rounded-lg border bg-white p-2", value: form.unit, onChange: (e) => setForm((prev) => ({ ...prev, unit: e.target.value })), children: [_jsx("option", { value: "", children: "\u043A\u0433 (\u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E)" }), _jsx("option", { value: "kg", children: "\u043A\u0433" }), _jsx("option", { value: "g", children: "\u0433" }), _jsx("option", { value: "l", children: "\u043B" })] })] }), _jsxs("label", { className: "text-sm", children: [_jsxs("span", { className: "mb-1 block text-xs text-slate-600", children: ["\u041A\u043E\u0434 \u0432\u0435\u0441\u043E\u0432 (", orgQuery.data?.weighed_code_length ?? "?", " \u0446\u0438\u0444\u0440)"] }), _jsx("input", { className: "w-full rounded-lg border bg-white p-2 font-mono", value: form.weighing_code, onChange: (e) => setForm((prev) => ({ ...prev, weighing_code: e.target.value })), inputMode: "numeric", pattern: "\\d+", placeholder: "12345" })] })] })) : null] })) : null, isOwner ? (_jsx(NumberInput, { className: "rounded-xl border p-3", placeholder: "\u0417\u0430\u043A\u0443\u043F\u043E\u0447\u043D\u0430\u044F \u0446\u0435\u043D\u0430", value: form.purchase_price, onChange: (value) => setForm((prev) => ({ ...prev, purchase_price: value })) })) : null, _jsx(NumberInput, { className: "rounded-xl border p-3", placeholder: "\u0413\u0430\u0440\u0430\u043D\u0442\u0438\u044F (\u043C\u0435\u0441)", value: form.warranty_months, onChange: (value) => setForm((prev) => ({ ...prev, warranty_months: value })) }), _jsx(NumberInput, { className: "rounded-xl border p-3", placeholder: "\u041C\u0438\u043D\u0438\u043C\u0430\u043B\u044C\u043D\u044B\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A", value: form.min_stock, onChange: (value) => setForm((prev) => ({ ...prev, min_stock: value })) }), _jsxs("div", { className: "flex gap-2 md:col-span-2", children: [_jsx("input", { className: "flex-1 rounded-xl border p-3", placeholder: "\u0428\u0442\u0440\u0438\u0445\u043A\u043E\u0434", value: form.barcode, onChange: (e) => setForm((prev) => ({ ...prev, barcode: e.target.value })) }), _jsx("button", { className: "rounded-xl border px-4", disabled: !editingProduct || generateBarcodeMutation.isPending, onClick: () => editingProduct && generateBarcodeMutation.mutate(editingProduct.id), children: "\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u0442\u044C" })] }), _jsxs("div", { className: "md:col-span-2", children: [_jsx("input", { className: "w-full rounded-xl border p-3", placeholder: "\u0414\u043E\u043F. \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434\u044B (\u0447\u0435\u0440\u0435\u0437 \u0437\u0430\u043F\u044F\u0442\u0443\u044E) \u2014 \u0434\u043B\u044F \u0440\u0430\u0437\u043D\u044B\u0445 \u0432\u043A\u0443\u0441\u043E\u0432 \u043E\u0434\u043D\u043E\u0433\u043E \u0442\u043E\u0432\u0430\u0440\u0430", value: form.extra_barcodes, onChange: (e) => setForm((prev) => ({ ...prev, extra_barcodes: e.target.value })) }), _jsx("p", { className: "mt-1 text-xs text-slate-500", children: "\u0412\u0441\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0435 \u043A\u043E\u0434\u044B \u0431\u0443\u0434\u0443\u0442 \u0432\u0435\u0441\u0442\u0438 \u043A \u044D\u0442\u043E\u043C\u0443 \u0442\u043E\u0432\u0430\u0440\u0443 \u043F\u0440\u0438 \u0441\u043A\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0438. \u041E\u0434\u0438\u043D \u043E\u0431\u0449\u0438\u0439 \u043E\u0441\u0442\u0430\u0442\u043E\u043A." })] })] }), _jsxs("div", { className: "mt-4 flex gap-2", children: [_jsx("button", { className: "flex-1 rounded-xl bg-primary p-3 text-white", onClick: () => saveProductMutation.mutate(), children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C" }), _jsx("button", { className: "flex-1 rounded-xl border p-3", onClick: () => setShowEditor(false), children: "\u041E\u0442\u043C\u0435\u043D\u0430" })] })] }) })) : null, showStockIn ? (_jsx("div", { className: "fixed inset-0 z-40 bg-black/40 p-4", children: _jsxs("div", { className: "mx-auto max-w-md rounded-2xl bg-white p-4", children: [_jsxs("h2", { className: "mb-3 text-xl font-semibold", children: ["\u041F\u0440\u0438\u0445\u043E\u0434 \u0442\u043E\u0432\u0430\u0440\u0430: ", stockProduct?.name] }), _jsxs("div", { className: "space-y-3", children: [_jsx(NumberInput, { className: "w-full rounded-xl border p-3", placeholder: stockProduct?.kind === "weighed" ? "Количество (кг)" : "Количество", value: stockQty, onChange: setStockQty }), _jsx(NumberInput, { className: "w-full rounded-xl border p-3", placeholder: "\u0426\u0435\u043D\u0430 \u0437\u0430\u043A\u0443\u043F\u043A\u0438 (\u0437\u0430 \u0435\u0434./\u043A\u0433)", value: stockPurchasePrice, onChange: setStockPurchasePrice }), isGrocery ? (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u041F\u043E\u0441\u0442\u0430\u0432\u0449\u0438\u043A" }), _jsx("input", { className: "w-full rounded-xl border p-3", list: "products-suppliers-list", placeholder: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0438\u043B\u0438 \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u043E\u0432\u043E\u0433\u043E", value: stockSupplier, onChange: (e) => setStockSupplier(e.target.value) }), _jsx("datalist", { id: "products-suppliers-list", children: (suppliersQuery.data ?? []).map((s) => (_jsx("option", { value: s.name }, s.id))) })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u0421\u0440\u043E\u043A \u0433\u043E\u0434\u043D\u043E\u0441\u0442\u0438" }), _jsx("input", { type: "date", className: "w-full rounded-xl border p-3", value: stockExpiryDate, onChange: (e) => setStockExpiryDate(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-xs text-slate-500", children: "\u041D\u043E\u043C\u0435\u0440 \u043F\u0430\u0440\u0442\u0438\u0438" }), _jsx("input", { className: "w-full rounded-xl border p-3", placeholder: "Batch # (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)", value: stockBatch, onChange: (e) => setStockBatch(e.target.value) })] })] })) : null] }), _jsxs("div", { className: "mt-4 flex gap-2", children: [_jsx("button", { className: "flex-1 rounded-xl bg-primary p-3 text-white", onClick: () => stockInMutation.mutate(), children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C" }), _jsx("button", { className: "flex-1 rounded-xl border p-3", onClick: () => setShowStockIn(false), children: "\u041E\u0442\u043C\u0435\u043D\u0430" })] })] }) })) : null] }));
}
