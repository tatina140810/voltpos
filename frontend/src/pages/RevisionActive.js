import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, ClipboardList, Minus, Plus, Search, X } from "lucide-react";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";
function fmt(iso) {
    if (!iso)
        return "—";
    return new Date(iso).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
function parseNum(v) {
    if (!v)
        return 0;
    const n = Number(String(v).replace(",", ".").trim());
    return Number.isFinite(n) ? n : 0;
}
export function RevisionActivePage() {
    const role = useAuthStore((s) => s.role);
    const myId = useAuthStore((s) => {
        // role известен, но id юзера лежит в JWT — парсим.
        const tk = s.token;
        if (!tk)
            return null;
        try {
            return Number(JSON.parse(atob(tk.split(".")[1])).sub);
        }
        catch {
            return null;
        }
    });
    const qc = useQueryClient();
    const navigate = useNavigate();
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(null);
    const [actualQty, setActualQty] = useState("0");
    const [scanning, setScanning] = useState(false);
    const [showCounted, setShowCounted] = useState(true);
    if (role !== "owner" && role !== "warehouse") {
        return _jsx(Navigate, { to: "/sale", replace: true });
    }
    const activeQuery = useQuery({
        queryKey: ["revisions-active"],
        queryFn: async () => (await api.get("/revisions/active")).data,
    });
    const revisionId = activeQuery.data?.revision?.id ?? null;
    const detailsQuery = useQuery({
        queryKey: ["revision-details", revisionId],
        enabled: revisionId !== null,
        queryFn: async () => (await api.get(`/revisions/${revisionId}`)).data,
        refetchInterval: 30000, // автообновление каждые 30 сек чтобы видеть коллег
    });
    const productsQuery = useQuery({
        queryKey: ["products-all"],
        queryFn: async () => (await api.get("/products")).data,
    });
    const upsertMutation = useMutation({
        mutationFn: async ({ productId, qty }) => {
            await api.post(`/revisions/${revisionId}/items`, { product_id: productId, actual_qty: qty });
        },
        onSuccess: () => {
            setSelected(null);
            setActualQty("0");
            setSearch("");
            qc.invalidateQueries({ queryKey: ["revision-details", revisionId] });
        },
        onError: (err) => {
            const detail = err.response?.data?.detail;
            alert(detail ?? "Не удалось сохранить");
        },
    });
    const completeMutation = useMutation({
        mutationFn: async () => (await api.post(`/revisions/${revisionId}/complete`, {})).data,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["revisions-list"] });
            qc.invalidateQueries({ queryKey: ["revisions-active"] });
            qc.invalidateQueries({ queryKey: ["stock-summary"] });
            qc.invalidateQueries({ queryKey: ["stock"] });
            alert("Ревизия завершена. Остатки обновлены.");
            navigate(`/revisions/${revisionId}/report`);
        },
        onError: (err) => {
            const detail = err.response?.data?.detail;
            alert(detail ?? "Не удалось завершить ревизию");
        },
    });
    const products = productsQuery.data ?? [];
    const items = detailsQuery.data?.items ?? [];
    const countedIds = new Set(items.map((i) => i.product_id));
    const filteredProducts = useMemo(() => {
        if (!search.trim())
            return [];
        const q = search.trim().toLowerCase();
        return products
            .filter((p) => p.name.toLowerCase().includes(q) ||
            (p.barcode && p.barcode.includes(q.replace(/\s/g, ""))))
            .slice(0, 10);
    }, [products, search]);
    const notCounted = useMemo(() => products.filter((p) => !countedIds.has(p.id)), [products, countedIds]);
    if (activeQuery.isLoading) {
        return _jsx("p", { className: "p-6 text-sm text-slate-500", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" });
    }
    if (!revisionId) {
        return (_jsxs("main", { className: "mx-auto max-w-2xl p-4 text-center", children: [_jsx(ClipboardList, { size: 32, className: "mx-auto mb-2 text-slate-400" }), _jsx("p", { className: "mb-3 text-sm text-slate-700", children: "\u0410\u043A\u0442\u0438\u0432\u043D\u043E\u0439 \u0440\u0435\u0432\u0438\u0437\u0438\u0438 \u043D\u0435\u0442." }), _jsx("button", { type: "button", onClick: () => navigate("/revisions"), className: "rounded-xl border border-slate-300 px-4 py-2 text-sm", children: "\u041A \u0441\u043F\u0438\u0441\u043A\u0443 \u0440\u0435\u0432\u0438\u0437\u0438\u0439" })] }));
    }
    const onScanned = (code) => {
        const trimmed = (code || "").trim();
        const p = products.find((x) => x.barcode === trimmed);
        setScanning(false);
        if (p) {
            setSelected(p);
            setActualQty(String(items.find((i) => i.product_id === p.id)?.actual_qty ?? "0"));
            return { ok: true, message: `✓ ${p.name}`, autoClose: true };
        }
        return { ok: false, message: `Не найден: ${trimmed}`, autoClose: false };
    };
    const inc = () => setActualQty((v) => String(parseNum(v) + 1));
    const dec = () => setActualQty((v) => String(Math.max(0, parseNum(v) - 1)));
    return (_jsxs("main", { className: "mx-auto max-w-3xl p-3", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between", children: [_jsxs("h1", { className: "text-xl font-bold text-slate-800", children: ["\u0420\u0435\u0432\u0438\u0437\u0438\u044F #", revisionId] }), role === "owner" ? (_jsx("button", { type: "button", onClick: () => {
                            if (window.confirm("Завершить ревизию? После этого остатки на складе будут пересчитаны и редактировать нельзя.")) {
                                completeMutation.mutate();
                            }
                        }, disabled: completeMutation.isPending, className: "rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60", children: completeMutation.isPending ? "Завершаю…" : "✅ Завершить" })) : null] }), _jsxs("div", { className: "mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("div", { className: "flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2", children: [_jsx(Search, { size: 16, className: "text-slate-400" }), _jsx("input", { type: "text", value: search, onChange: (e) => setSearch(e.target.value), placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0438\u043B\u0438 \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434\u2026", className: "flex-1 bg-transparent text-sm focus:outline-none" }), search ? (_jsx("button", { onClick: () => setSearch(""), className: "text-slate-400 hover:text-slate-600", children: _jsx(X, { size: 14 }) })) : null] }), _jsx("button", { type: "button", onClick: () => setScanning(true), className: "flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-primary hover:bg-indigo-50", title: "\u0421\u043A\u0430\u043D\u0435\u0440", children: _jsx(Camera, { size: 18 }) })] }), filteredProducts.length > 0 && !selected ? (_jsx("div", { className: "mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-200", children: filteredProducts.map((p) => {
                            const counted = items.find((i) => i.product_id === p.id);
                            return (_jsxs("button", { type: "button", onClick: () => {
                                    setSelected(p);
                                    setActualQty(counted ? String(counted.actual_qty) : "0");
                                }, className: "flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50", children: [_jsxs("div", { children: [_jsx("p", { className: "font-medium", children: p.name }), _jsx("p", { className: "text-xs text-slate-500", children: p.barcode ?? "—" })] }), counted ? (_jsxs("span", { className: "text-[10px] text-emerald-600", children: ["\u2713 ", counted.actual_qty] })) : null] }, p.id));
                        }) })) : null] }), selected ? (_jsxs("div", { className: "mb-3 rounded-2xl border-2 border-primary/40 bg-white p-4 shadow-md", children: [_jsxs("div", { className: "mb-3 flex items-start justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-base font-bold text-slate-800", children: selected.name }), _jsx("p", { className: "text-xs font-mono text-slate-500", children: selected.barcode ?? "—" }), (() => {
                                        const it = items.find((i) => i.product_id === selected.id);
                                        if (!it)
                                            return _jsx("p", { className: "mt-1 text-xs text-slate-500", children: "\u0415\u0449\u0451 \u043D\u0435 \u0441\u0447\u0438\u0442\u0430\u043B\u0438" });
                                        if (it.counted_by !== myId) {
                                            return (_jsxs("p", { className: "mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700", children: ["\u26A0 \u0423\u0436\u0435 \u043F\u043E\u0441\u0447\u0438\u0442\u0430\u043B ", it.counted_by_name ?? "коллега", " (", it.actual_qty, ", \u0432 ", fmt(it.updated_at), "). \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C?"] }));
                                        }
                                        return _jsxs("p", { className: "mt-1 text-xs text-slate-500", children: ["\u0422\u044B \u043F\u043E\u0441\u0447\u0438\u0442\u0430\u043B: ", it.actual_qty] });
                                    })()] }), _jsx("button", { onClick: () => { setSelected(null); setActualQty("0"); }, className: "text-2xl text-slate-400", children: "\u00D7" })] }), _jsx("p", { className: "mb-2 text-xs uppercase tracking-wide text-slate-500", children: "\u0424\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043D\u0430 \u0441\u043A\u043B\u0430\u0434\u0435" }), _jsxs("div", { className: "flex items-center justify-center gap-3", children: [_jsx("button", { type: "button", onClick: dec, className: "flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-2xl font-bold text-slate-700 active:bg-slate-200", children: _jsx(Minus, { size: 28 }) }), _jsx("input", { type: "text", inputMode: "decimal", value: actualQty, onChange: (e) => setActualQty(e.target.value), className: "h-14 w-32 rounded-xl border-2 border-slate-300 text-center text-2xl font-bold tabular-nums focus:border-primary focus:outline-none" }), _jsx("button", { type: "button", onClick: inc, className: "flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-2xl font-bold text-slate-700 active:bg-slate-200", children: _jsx(Plus, { size: 28 }) })] }), _jsxs("button", { type: "button", onClick: () => upsertMutation.mutate({ productId: selected.id, qty: parseNum(actualQty) }), disabled: upsertMutation.isPending, className: "mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-60", children: [_jsx(Check, { size: 20 }), upsertMutation.isPending ? "Сохраняю…" : "Сохранить"] })] })) : null, _jsxs("div", { className: "mb-2 rounded-2xl border border-slate-200 bg-white shadow-sm", children: [_jsxs("button", { type: "button", onClick: () => setShowCounted((v) => !v), className: "flex w-full items-center justify-between border-b px-4 py-2 text-sm font-semibold text-slate-700", children: [_jsxs("span", { children: ["\u2705 \u041F\u043E\u0434\u0441\u0447\u0438\u0442\u0430\u043D\u043E: ", items.length] }), _jsx("span", { children: showCounted ? "▾" : "▸" })] }), showCounted ? (_jsx("div", { className: "max-h-80 overflow-y-auto", children: items.length === 0 ? (_jsx("p", { className: "p-3 text-sm text-slate-500", children: "\u041F\u043E\u043A\u0430 \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u0441\u0447\u0438\u0442\u0430\u043B\u0438." })) : (items.map((it) => {
                            const delta = parseNum(it.actual_qty) - parseNum(it.expected_qty);
                            return (_jsxs("button", { type: "button", onClick: () => {
                                    const p = products.find((pp) => pp.id === it.product_id);
                                    if (p) {
                                        setSelected(p);
                                        setActualQty(it.actual_qty);
                                    }
                                }, className: "flex w-full items-start justify-between border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50", children: [_jsxs("div", { children: [_jsx("p", { className: "font-medium", children: it.product_name }), _jsxs("p", { className: "text-xs text-slate-500", children: ["\u0443\u0447\u0451\u0442: ", it.expected_qty, " \u00B7 \u0444\u0430\u043A\u0442: ", _jsx("b", { children: it.actual_qty }), it.counted_by_name ? ` · ${it.counted_by_name}` : ""] })] }), _jsx("span", { className: `whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${delta === 0
                                            ? "bg-emerald-100 text-emerald-700"
                                            : delta > 0
                                                ? "bg-blue-100 text-blue-700"
                                                : "bg-red-100 text-red-700"}`, children: delta > 0 ? `+${delta}` : delta })] }, it.id));
                        })) })) : null] }), _jsxs("div", { className: "rounded-2xl border border-slate-200 bg-white shadow-sm", children: [_jsxs("div", { className: "border-b px-4 py-2 text-sm font-semibold text-slate-700", children: ["\u23F3 \u041E\u0441\u0442\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0434\u0441\u0447\u0438\u0442\u0430\u0442\u044C: ", notCounted.length] }), _jsx("div", { className: "max-h-80 overflow-y-auto", children: notCounted.length === 0 ? (_jsx("p", { className: "p-3 text-center text-sm text-slate-500", children: "\u0412\u0441\u0435 \u0442\u043E\u0432\u0430\u0440\u044B \u043F\u043E\u0441\u0447\u0438\u0442\u0430\u043D\u044B \uD83C\uDF89" })) : (notCounted.slice(0, 50).map((p) => (_jsxs("button", { type: "button", onClick: () => {
                                setSelected(p);
                                setActualQty("0");
                            }, className: "flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50", children: [_jsx("span", { children: p.name }), _jsx("span", { className: "text-xs text-slate-400", children: p.barcode ?? "—" })] }, p.id)))) })] }), scanning ? (_jsx("div", { className: "fixed inset-0 z-[80] bg-black", children: _jsx(BarcodeScanner, { onDetected: onScanned, onClose: () => setScanning(false) }) })) : null] }));
}
