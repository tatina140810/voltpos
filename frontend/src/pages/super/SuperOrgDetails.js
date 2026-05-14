import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { extractError } from "../../lib/extractError";
import { superApi } from "../../lib/superApi";
import { STORE_CATEGORY_GROUPS } from "../../lib/storeCategories";
import { MODULE_LABELS } from "../../lib/businessModules";
const statusBadge = {
    active: "bg-emerald-100 text-emerald-700",
    blocked: "bg-rose-100 text-rose-700",
    no_payment_set: "bg-amber-100 text-amber-700",
};
function formatRu(date) {
    return new Date(date + "T00:00:00").toLocaleDateString("ru-RU");
}
export function SuperOrgDetails() {
    const params = useParams();
    const orgId = Number(params.id);
    const queryClient = useQueryClient();
    const { data: org, isLoading } = useQuery({
        queryKey: ["super", "org", orgId],
        queryFn: async () => (await superApi.get(`/super/orgs/${orgId}`)).data,
        enabled: !Number.isNaN(orgId),
    });
    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["super", "org", orgId] });
        queryClient.invalidateQueries({ queryKey: ["super", "orgs"] });
        queryClient.invalidateQueries({ queryKey: ["super", "stats"] });
    };
    if (isLoading)
        return _jsx("p", { className: "text-slate-500", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." });
    if (!org)
        return _jsx("p", { className: "text-rose-600", children: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D." });
    const status = statusBadge[org.status];
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx(Link, { to: "/super/orgs", className: "text-sm text-slate-500 hover:underline", children: "\u2190 \u0412\u0441\u0435 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u044B" }), _jsx("h1", { className: "mt-2 text-2xl font-bold text-slate-900", children: org.name }), _jsxs("p", { className: "font-mono text-sm text-slate-500", children: [org.org_code, " \u00B7 ", org.slug] })] }), _jsxs("span", { className: `rounded-full px-3 py-1 text-sm ${status}`, children: [org.status === "active" && `Активен (${org.days_left} дн осталось)`, org.status === "blocked" && "Заблокирован", org.status === "no_payment_set" && "Без подписки"] })] }), _jsx(OrgInfoCard, { org: org, onUpdated: invalidate }), _jsx(BusinessTypeCard, { org: org, onUpdated: invalidate }), _jsx(PaymentsCard, { org: org, onUpdated: invalidate }), _jsx(ImportCard, { orgId: org.id }), _jsx(EmployeesCard, { org: org, onUpdated: invalidate })] }));
}
function ImportCard({ orgId }) {
    const [file, setFile] = useState(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const upload = useMutation({
        mutationFn: async () => {
            if (!file)
                throw new Error("Файл не выбран");
            const form = new FormData();
            form.append("file", file);
            const response = await superApi.post(`/super/orgs/${orgId}/import`, form, {
                headers: { "Content-Type": "multipart/form-data" },
                timeout: 120000,
            });
            return response.data;
        },
        onSuccess: (data) => {
            setResult(data);
            setFile(null);
        },
        onError: (err) => setError(extractError(err, "Не удалось импортировать")),
    });
    return (_jsxs("section", { className: "rounded-2xl border bg-white p-6 shadow-sm", children: [_jsx("h2", { className: "text-sm font-semibold uppercase tracking-wide text-slate-500", children: "\u0418\u043C\u043F\u043E\u0440\u0442 \u043E\u0441\u0442\u0430\u0442\u043A\u043E\u0432 \u0438\u0437 Excel" }), _jsx("p", { className: "mt-2 text-sm text-slate-500", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 .xlsx-\u0444\u0430\u0439\u043B \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0430 Umag. \u041A\u043E\u043B\u043E\u043D\u043A\u0438: A \u2014 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435, B \u2014 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F, D \u2014 \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434, F \u2014 \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E, H \u2014 \u0446\u0435\u043D\u0430 \u043F\u0440\u043E\u0434\u0430\u0436\u0438, J \u2014 \u0437\u0430\u043A\u0443\u043F\u043E\u0447\u043D\u0430\u044F \u0446\u0435\u043D\u0430. \u0421\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0435 \u0442\u043E\u0432\u0430\u0440\u044B \u043E\u0431\u043D\u043E\u0432\u044F\u0442\u0441\u044F, \u043A\u043E\u043B-\u0432\u043E \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u0441\u044F \u043A\u0430\u043A \u043F\u0440\u0438\u0445\u043E\u0434." }), _jsxs("div", { className: "mt-4 flex flex-wrap items-center gap-3", children: [_jsx("input", { type: "file", accept: ".xlsx", onChange: (e) => {
                            setFile(e.target.files?.[0] ?? null);
                            setResult(null);
                            setError("");
                        }, className: "text-sm" }), _jsx("button", { onClick: () => {
                            setError("");
                            upload.mutate();
                        }, disabled: !file || upload.isPending, className: "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50", children: upload.isPending ? "Загружаем..." : "Загрузить и импортировать" })] }), error ? _jsx("p", { className: "mt-3 text-sm text-rose-600", children: error }) : null, result ? (_jsxs("div", { className: "mt-4 space-y-2 rounded-xl border bg-slate-50 p-4 text-sm", children: [_jsxs("div", { className: "flex gap-6", children: [_jsxs("span", { className: "text-emerald-700", children: ["\u0421\u043E\u0437\u0434\u0430\u043D\u043E: ", _jsx("b", { children: result.created })] }), _jsxs("span", { className: "text-blue-700", children: ["\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E: ", _jsx("b", { children: result.updated })] }), _jsxs("span", { className: "text-amber-700", children: ["\u041F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E: ", _jsx("b", { children: result.skipped })] }), _jsxs("span", { className: "text-rose-700", children: ["\u041E\u0448\u0438\u0431\u043E\u043A: ", _jsx("b", { children: result.errors.length })] })] }), result.errors.length > 0 ? (_jsxs("details", { className: "mt-2", children: [_jsxs("summary", { className: "cursor-pointer text-slate-600 hover:underline", children: ["\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043E\u0448\u0438\u0431\u043A\u0438 \u0438 \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u0438 (", result.errors.length, ")"] }), _jsx("ul", { className: "mt-2 max-h-64 list-disc space-y-1 overflow-auto pl-6 text-xs text-slate-600", children: result.errors.map((err, idx) => (_jsxs("li", { children: ["\u0421\u0442\u0440\u043E\u043A\u0430 ", err.row, ": ", err.reason] }, idx))) })] })) : null] })) : null] }));
}
function OrgInfoCard({ org, onUpdated }) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [confirmText, setConfirmText] = useState("");
    const [deleteError, setDeleteError] = useState("");
    const deleteMutation = useMutation({
        mutationFn: async () => {
            await superApi.delete(`/super/orgs/${org.id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["super", "orgs"] });
            queryClient.invalidateQueries({ queryKey: ["super", "stats"] });
            navigate("/super/orgs");
        },
        onError: (err) => setDeleteError(extractError(err, "Не удалось удалить магазин")),
    });
    const [name, setName] = useState(org.name);
    const [category, setCategory] = useState(org.category || "");
    const [monthlyFee, setMonthlyFee] = useState(org.monthly_fee?.toString() || "");
    const [paidUntil, setPaidUntil] = useState(org.paid_until || "");
    const [isActive, setIsActive] = useState(org.is_active);
    const [weighedOn, setWeighedOn] = useState(org.weighed.enabled);
    const [wPrefix, setWPrefix] = useState(org.weighed.prefix || "");
    const [wCodeLen, setWCodeLen] = useState(org.weighed.code_length?.toString() || "");
    const [wGramsLen, setWGramsLen] = useState(org.weighed.grams_length?.toString() || "");
    const [error, setError] = useState("");
    const save = useMutation({
        mutationFn: async () => {
            await superApi.patch(`/super/orgs/${org.id}`, {
                name,
                category: category || null,
                monthly_fee: monthlyFee ? Number(monthlyFee) : null,
                paid_until: paidUntil || null,
                is_active: isActive,
                has_weighed_products: weighedOn,
                weighed_barcode_prefix: weighedOn ? wPrefix || null : null,
                weighed_code_length: weighedOn && wCodeLen ? Number(wCodeLen) : null,
                weighed_grams_length: weighedOn && wGramsLen ? Number(wGramsLen) : null,
            });
        },
        onSuccess: () => {
            setEditing(false);
            onUpdated();
        },
        onError: (err) => setError(extractError(err, "Ошибка сохранения")),
    });
    return (_jsxs("section", { className: "rounded-2xl border bg-white p-6 shadow-sm", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h2", { className: "text-sm font-semibold uppercase tracking-wide text-slate-500", children: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D \u0438 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0430" }), !editing ? (_jsxs("div", { className: "flex gap-4", children: [_jsx("button", { onClick: () => setEditing(true), className: "text-sm text-blue-600 hover:underline", children: "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C" }), _jsx("button", { onClick: () => {
                                    setConfirmDelete(true);
                                    setConfirmText("");
                                    setDeleteError("");
                                }, className: "text-sm text-rose-600 hover:underline", children: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043C\u0430\u0433\u0430\u0437\u0438\u043D" })] })) : null] }), confirmDelete ? (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4", children: _jsxs("div", { className: "w-full max-w-md rounded-2xl bg-white p-6 shadow-xl", children: [_jsxs("h3", { className: "text-lg font-bold text-slate-900", children: ["\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043C\u0430\u0433\u0430\u0437\u0438\u043D \u00AB", org.name, "\u00BB?"] }), _jsx("p", { className: "mt-2 text-sm text-slate-600", children: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D \u0431\u0443\u0434\u0435\u0442 \u043F\u043E\u043C\u0435\u0447\u0435\u043D \u0443\u0434\u0430\u043B\u0451\u043D\u043D\u044B\u043C \u0438 \u043F\u0440\u043E\u043F\u0430\u0434\u0451\u0442 \u0438\u0437 \u0441\u043F\u0438\u0441\u043A\u0430. \u041A\u0430\u0441\u0441\u0438\u0440\u044B \u043D\u0435 \u0441\u043C\u043E\u0433\u0443\u0442 \u0432\u043E\u0439\u0442\u0438. \u0414\u0430\u043D\u043D\u044B\u0435 (\u0442\u043E\u0432\u0430\u0440\u044B, \u043F\u0440\u043E\u0434\u0430\u0436\u0438) \u0444\u0438\u0437\u0438\u0447\u0435\u0441\u043A\u0438 \u043E\u0441\u0442\u0430\u043D\u0443\u0442\u0441\u044F \u0432 \u0411\u0414 \u2014 \u043C\u043E\u0436\u043D\u043E \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0432\u0440\u0443\u0447\u043D\u0443\u044E." }), _jsxs("p", { className: "mt-3 text-sm text-slate-700", children: ["\u0427\u0442\u043E\u0431\u044B \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C, \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0430: ", _jsx("b", { children: org.name })] }), _jsx("input", { className: "mt-2 w-full rounded-lg border p-2.5", value: confirmText, onChange: (e) => setConfirmText(e.target.value), placeholder: org.name, autoFocus: true }), deleteError ? _jsx("p", { className: "mt-2 text-sm text-rose-600", children: deleteError }) : null, _jsxs("div", { className: "mt-4 flex justify-end gap-2", children: [_jsx("button", { onClick: () => setConfirmDelete(false), className: "rounded-lg border px-4 py-2 text-sm text-slate-700 hover:bg-slate-50", children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx("button", { onClick: () => {
                                        setDeleteError("");
                                        deleteMutation.mutate();
                                    }, disabled: confirmText.trim() !== org.name || deleteMutation.isPending, className: "rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50", children: deleteMutation.isPending ? "Удаляем..." : "Удалить" })] })] }) })) : null, !editing ? (_jsxs("dl", { className: "mt-4 grid grid-cols-1 gap-4 md:grid-cols-3", children: [_jsx(Field, { label: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", value: org.name }), _jsx(Field, { label: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F", value: org.category || "—" }), _jsx(Field, { label: "\u0426\u0435\u043D\u0430 \u0432 \u043C\u0435\u0441\u044F\u0446", value: org.monthly_fee != null ? `${org.monthly_fee.toLocaleString("ru-RU")} ₽` : "—" }), _jsx(Field, { label: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E \u0434\u043E", value: org.paid_until ? formatRu(org.paid_until) : "—" }), _jsx(Field, { label: "\u0410\u043A\u0442\u0438\u0432\u0435\u043D", value: org.is_active ? "Да" : "Нет" }), _jsx(Field, { label: "\u041A\u043E\u0434 \u0432\u0445\u043E\u0434\u0430", value: org.org_code, mono: true }), _jsx(Field, { label: "\u0421\u043E\u0437\u0434\u0430\u043D", value: new Date(org.created_at).toLocaleDateString("ru-RU") }), _jsx(Field, { label: "\u0412\u0435\u0441\u043E\u0432\u044B\u0435 \u0442\u043E\u0432\u0430\u0440\u044B", value: org.weighed.enabled
                            ? `Вкл (формат: ${org.weighed.prefix}+${org.weighed.code_length}код+${org.weighed.grams_length}гр)`
                            : "Выкл" })] })) : (_jsxs("form", { className: "mt-4 grid grid-cols-1 gap-4 md:grid-cols-2", onSubmit: (e) => {
                    e.preventDefault();
                    setError("");
                    save.mutate();
                }, children: [_jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1 block text-sm text-slate-600", children: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435" }), _jsx("input", { className: "w-full rounded-lg border p-2.5", value: name, onChange: (e) => setName(e.target.value), required: true })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1 block text-sm text-slate-600", children: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0430" }), _jsxs("select", { className: "w-full rounded-lg border bg-white p-2.5", value: category, onChange: (e) => setCategory(e.target.value), children: [_jsx("option", { value: "", children: "\u2014 \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u0430 \u2014" }), STORE_CATEGORY_GROUPS.map((group) => (_jsx("optgroup", { label: group.label, children: group.items.map((item) => (_jsx("option", { value: item, children: item }, item))) }, group.label)))] })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1 block text-sm text-slate-600", children: "\u0426\u0435\u043D\u0430 \u0432 \u043C\u0435\u0441\u044F\u0446, \u20BD" }), _jsx("input", { className: "w-full rounded-lg border p-2.5", type: "number", min: 0, value: monthlyFee, onChange: (e) => setMonthlyFee(e.target.value) })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1 block text-sm text-slate-600", children: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E \u0434\u043E" }), _jsx("input", { className: "w-full rounded-lg border p-2.5", type: "date", value: paidUntil, onChange: (e) => setPaidUntil(e.target.value) })] }), _jsxs("label", { className: "flex items-center gap-2 pt-7", children: [_jsx("input", { type: "checkbox", checked: isActive, onChange: (e) => setIsActive(e.target.checked) }), _jsx("span", { className: "text-sm", children: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D \u0430\u043A\u0442\u0438\u0432\u0435\u043D (\u0435\u0441\u043B\u0438 \u0432\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u2014 \u043A\u0430\u0441\u0441\u0430 \u043D\u0435 \u043F\u0443\u0441\u0442\u0438\u0442)" })] }), _jsxs("div", { className: "md:col-span-2 rounded-lg border bg-slate-50 p-3", children: [_jsxs("label", { className: "flex items-center gap-2", children: [_jsx("input", { type: "checkbox", checked: weighedOn, onChange: (e) => setWeighedOn(e.target.checked) }), _jsx("span", { className: "text-sm font-medium", children: "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0432\u0435\u0441\u043E\u0432\u044B\u0435 \u0442\u043E\u0432\u0430\u0440\u044B (\u0438\u043D\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044F \u0441 \u0432\u0435\u0441\u0430\u043C\u0438)" })] }), weighedOn ? (_jsxs("div", { className: "mt-3 grid grid-cols-3 gap-3", children: [_jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1 block text-xs text-slate-600", children: "\u041F\u0440\u0435\u0444\u0438\u043A\u0441 \u0448\u0442\u0440\u0438\u0445\u043A\u043E\u0434\u0430" }), _jsx("input", { className: "w-full rounded border p-2 font-mono", value: wPrefix, onChange: (e) => setWPrefix(e.target.value), placeholder: "2 \u0438\u043B\u0438 21", pattern: "\\d{1,2}" })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1 block text-xs text-slate-600", children: "\u0414\u043B\u0438\u043D\u0430 \u043A\u043E\u0434\u0430 \u0442\u043E\u0432\u0430\u0440\u0430" }), _jsx("input", { className: "w-full rounded border p-2", type: "number", min: 1, max: 10, value: wCodeLen, onChange: (e) => setWCodeLen(e.target.value), placeholder: "5" })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1 block text-xs text-slate-600", children: "\u0414\u043B\u0438\u043D\u0430 \u0433\u0440\u0430\u043C\u043C\u043E\u0432" }), _jsx("input", { className: "w-full rounded border p-2", type: "number", min: 1, max: 10, value: wGramsLen, onChange: (e) => setWGramsLen(e.target.value), placeholder: "5" })] }), _jsxs("p", { className: "md:col-span-3 text-xs text-slate-500", children: ["\u0421\u0443\u043C\u043C\u0430 (\u043F\u0440\u0435\u0444\u0438\u043A\u0441 + \u043A\u043E\u0434 + \u0433\u0440\u0430\u043C\u043C\u044B + 1 \u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u0430\u044F \u0446\u0438\u0444\u0440\u0430) \u0434\u043E\u043B\u0436\u043D\u0430 \u0440\u0430\u0432\u043D\u044F\u0442\u044C\u0441\u044F 13. \u0421\u0435\u0439\u0447\u0430\u0441: ", wPrefix.length, " + ", wCodeLen || "?", " + ", wGramsLen || "?", " + 1 =", " ", wPrefix.length + (Number(wCodeLen) || 0) + (Number(wGramsLen) || 0) + 1] })] })) : null] }), error ? _jsx("p", { className: "md:col-span-2 text-sm text-rose-600", children: error }) : null, _jsxs("div", { className: "md:col-span-2 flex justify-end gap-2", children: [_jsx("button", { type: "button", onClick: () => setEditing(false), className: "rounded-lg border px-4 py-2 text-sm text-slate-700 hover:bg-slate-50", children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx("button", { type: "submit", disabled: save.isPending, className: "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50", children: save.isPending ? "Сохраняем..." : "Сохранить" })] })] }))] }));
}
function Field({ label, value, mono }) {
    return (_jsxs("div", { children: [_jsx("dt", { className: "text-xs uppercase tracking-wide text-slate-400", children: label }), _jsx("dd", { className: `mt-1 text-base text-slate-900 ${mono ? "font-mono" : ""}`, children: value })] }));
}
function BusinessTypeCard({ org, onUpdated }) {
    const { data: templates } = useQuery({
        queryKey: ["super", "business-templates"],
        queryFn: async () => (await superApi.get("/super/business/templates")).data,
    });
    const [selectedKey, setSelectedKey] = useState(org.business_type || "");
    const [error, setError] = useState("");
    const [flashKey, setFlashKey] = useState(null);
    const currentTemplate = templates?.find((t) => t.key === org.business_type);
    const previewTemplate = templates?.find((t) => t.key === selectedKey);
    const apply = useMutation({
        mutationFn: async () => {
            if (!selectedKey)
                return;
            await superApi.post(`/super/orgs/${org.id}/business-type`, {
                business_type: selectedKey,
            });
        },
        onSuccess: onUpdated,
        onError: (err) => setError(extractError(err, "Не удалось применить шаблон")),
    });
    const toggleModule = useMutation({
        mutationFn: async (vars) => {
            await superApi.patch(`/super/orgs/${org.id}/modules`, {
                modules: { [vars.key]: vars.value },
            });
            return vars.key;
        },
        onSuccess: (key) => {
            setFlashKey(key);
            setTimeout(() => setFlashKey((curr) => (curr === key ? null : curr)), 1800);
            onUpdated();
        },
        onError: (err) => setError(extractError(err, "Не удалось обновить модули")),
    });
    return (_jsxs("section", { className: "rounded-2xl border bg-white p-6 shadow-sm", children: [_jsx("h2", { className: "text-sm font-semibold uppercase tracking-wide text-slate-500", children: "\u0428\u0430\u0431\u043B\u043E\u043D \u0431\u0438\u0437\u043D\u0435\u0441\u0430 \u0438 \u043C\u043E\u0434\u0443\u043B\u0438" }), _jsxs("div", { className: "mt-4 space-y-4", children: [_jsxs("div", { className: "rounded-lg border bg-slate-50 p-3", children: [_jsx("div", { className: "text-sm text-slate-600", children: "\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u0448\u0430\u0431\u043B\u043E\u043D:" }), _jsx("div", { className: "mt-1 text-lg font-medium", children: currentTemplate ? `${currentTemplate.icon} ${currentTemplate.name}` : "— не выбран —" })] }), _jsxs("div", { className: "grid grid-cols-1 gap-3 md:grid-cols-3", children: [_jsxs("label", { className: "md:col-span-2 block", children: [_jsx("span", { className: "mb-1 block text-sm text-slate-600", children: "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0438\u043B\u0438 \u0441\u043C\u0435\u043D\u0438\u0442\u044C \u0448\u0430\u0431\u043B\u043E\u043D" }), _jsxs("select", { className: "w-full rounded-lg border bg-white p-2.5", value: selectedKey, onChange: (e) => setSelectedKey(e.target.value), children: [_jsx("option", { value: "", children: "\u2014 \u043D\u0435 \u043C\u0435\u043D\u044F\u0442\u044C \u2014" }), (templates ?? []).map((t) => (_jsxs("option", { value: t.key, children: [t.icon, " ", t.name] }, t.key)))] })] }), _jsx("button", { onClick: () => {
                                    setError("");
                                    apply.mutate();
                                }, disabled: !selectedKey || apply.isPending || selectedKey === org.business_type, title: "\u0421\u043C\u0435\u043D\u0438\u0442 \u0448\u0430\u0431\u043B\u043E\u043D \u0438 \u0421\u0411\u0420\u041E\u0421\u0418\u0422 \u0440\u0443\u0447\u043D\u044B\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043C\u043E\u0434\u0443\u043B\u0435\u0439 \u043F\u043E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u043C\u0443 \u0448\u0430\u0431\u043B\u043E\u043D\u0443. \u0410\u043A\u0442\u0438\u0432\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u043A\u043E\u0433\u0434\u0430 \u0432\u044B\u0431\u0440\u0430\u043D \u0434\u0440\u0443\u0433\u043E\u0439 \u0448\u0430\u0431\u043B\u043E\u043D.", className: "self-end rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50", children: apply.isPending ? "Применяем..." : "Применить шаблон" })] }), previewTemplate && selectedKey !== org.business_type ? (_jsxs("div", { className: "rounded-lg border bg-blue-50 p-3 text-sm", children: [_jsx("div", { className: "font-medium text-blue-900", children: "\u0411\u0443\u0434\u0435\u0442 \u043F\u0440\u0438\u043C\u0435\u043D\u0435\u043D\u043E:" }), _jsxs("div", { className: "mt-1 text-blue-800", children: ["\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u0441\u044F: ", Object.entries(previewTemplate.modules)
                                        .filter(([, v]) => v)
                                        .map(([k]) => MODULE_LABELS.find((m) => m.key === k)?.label ?? k)
                                        .join(", ") || "—"] }), _jsxs("div", { className: "mt-1 text-blue-800", children: ["\u0412\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u0441\u044F: ", Object.entries(previewTemplate.modules)
                                        .filter(([, v]) => !v)
                                        .map(([k]) => MODULE_LABELS.find((m) => m.key === k)?.label ?? k)
                                        .join(", ") || "—"] }), _jsxs("div", { className: "mt-1 text-blue-800", children: ["\u041F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0438 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0439: ", previewTemplate.default_categories.join(", ")] })] })) : null, org.business_type ? (_jsxs("div", { children: [_jsxs("div", { className: "mb-2 flex items-center justify-between", children: [_jsx("div", { className: "text-sm font-medium text-slate-700", children: "\u041C\u043E\u0434\u0443\u043B\u0438 (\u043C\u043E\u0436\u043D\u043E \u0434\u043E\u043A\u0440\u0443\u0442\u0438\u0442\u044C \u0432\u0440\u0443\u0447\u043D\u0443\u044E)" }), _jsx("div", { className: "text-xs text-slate-500", children: "\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438" })] }), _jsx("div", { className: "grid grid-cols-1 gap-2 md:grid-cols-2", children: MODULE_LABELS.map((m) => {
                                    const value = org.business_modules[m.key] ?? false;
                                    const flashed = flashKey === m.key;
                                    return (_jsxs("label", { className: "flex items-center gap-2 rounded-lg border p-2 text-sm", children: [_jsx("input", { type: "checkbox", checked: value, disabled: toggleModule.isPending, onChange: (e) => {
                                                    setError("");
                                                    toggleModule.mutate({ key: m.key, value: e.target.checked });
                                                } }), _jsx("span", { children: m.icon }), _jsx("span", { className: value ? "text-slate-900" : "text-slate-500", children: m.label }), flashed ? (_jsx("span", { className: "ml-auto text-xs font-medium text-emerald-600", children: "\u2713 \u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E" })) : null] }, m.key));
                                }) })] })) : (_jsx("p", { className: "text-sm text-slate-500", children: "\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0438 \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u0435 \u0448\u0430\u0431\u043B\u043E\u043D \u2014 \u0442\u043E\u0433\u0434\u0430 \u043C\u043E\u0434\u0443\u043B\u0438 \u043C\u043E\u0436\u043D\u043E \u0431\u0443\u0434\u0435\u0442 \u0434\u043E\u043A\u0440\u0443\u0442\u0438\u0442\u044C \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E." })), error ? _jsx("p", { className: "text-sm text-rose-600", children: error }) : null] })] }));
}
function PaymentsCard({ org, onUpdated }) {
    const [amount, setAmount] = useState(org.monthly_fee?.toString() || "");
    const [periodUntil, setPeriodUntil] = useState("");
    const [note, setNote] = useState("");
    const [error, setError] = useState("");
    const submit = useMutation({
        mutationFn: async () => {
            await superApi.post(`/super/orgs/${org.id}/payments`, {
                amount: Number(amount),
                period_until: periodUntil,
                note: note || null,
            });
        },
        onSuccess: () => {
            setAmount(org.monthly_fee?.toString() || "");
            setPeriodUntil("");
            setNote("");
            onUpdated();
        },
        onError: (err) => setError(extractError(err, "Не удалось сохранить платёж")),
    });
    return (_jsxs("section", { className: "rounded-2xl border bg-white p-6 shadow-sm", children: [_jsx("h2", { className: "text-sm font-semibold uppercase tracking-wide text-slate-500", children: "\u041F\u043B\u0430\u0442\u0435\u0436\u0438" }), _jsxs("form", { className: "mt-4 grid grid-cols-1 gap-3 md:grid-cols-4", onSubmit: (e) => {
                    e.preventDefault();
                    setError("");
                    submit.mutate();
                }, children: [_jsx("input", { className: "rounded-lg border p-2.5", type: "number", min: 0, placeholder: "\u0421\u0443\u043C\u043C\u0430 \u20BD", value: amount, onChange: (e) => setAmount(e.target.value), required: true }), _jsx("input", { className: "rounded-lg border p-2.5", type: "date", value: periodUntil, onChange: (e) => setPeriodUntil(e.target.value), required: true }), _jsx("input", { className: "rounded-lg border p-2.5 md:col-span-1", placeholder: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439", value: note, onChange: (e) => setNote(e.target.value) }), _jsx("button", { type: "submit", disabled: submit.isPending, className: "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50", children: submit.isPending ? "..." : "Зафиксировать" }), error ? _jsx("p", { className: "md:col-span-4 text-sm text-rose-600", children: error }) : null] }), org.payments.length === 0 ? (_jsx("p", { className: "mt-4 text-sm text-slate-400", children: "\u041F\u043B\u0430\u0442\u0435\u0436\u0435\u0439 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442." })) : (_jsxs("table", { className: "mt-4 w-full text-sm", children: [_jsx("thead", { className: "text-left text-slate-500", children: _jsxs("tr", { children: [_jsx("th", { className: "py-2", children: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E" }), _jsx("th", { className: "py-2", children: "\u0421\u0443\u043C\u043C\u0430" }), _jsx("th", { className: "py-2", children: "\u0414\u043E \u043A\u0430\u043A\u043E\u0433\u043E \u0447\u0438\u0441\u043B\u0430" }), _jsx("th", { className: "py-2", children: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439" })] }) }), _jsx("tbody", { children: org.payments.map((p) => (_jsxs("tr", { className: "border-t", children: [_jsx("td", { className: "py-2", children: formatRu(p.paid_at) }), _jsxs("td", { className: "py-2", children: [p.amount.toLocaleString("ru-RU"), " \u20BD"] }), _jsx("td", { className: "py-2", children: formatRu(p.period_until) }), _jsx("td", { className: "py-2 text-slate-600", children: p.note || "" })] }, p.id))) })] }))] }));
}
function EmployeesCard({ org, onUpdated }) {
    const [showAdd, setShowAdd] = useState(false);
    return (_jsxs("section", { className: "rounded-2xl border bg-white p-6 shadow-sm", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h2", { className: "text-sm font-semibold uppercase tracking-wide text-slate-500", children: "\u0421\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A\u0438" }), _jsx("button", { onClick: () => setShowAdd((v) => !v), className: "text-sm text-blue-600 hover:underline", children: showAdd ? "Скрыть форму" : "+ Добавить сотрудника" })] }), showAdd ? (_jsx(AddEmployeeForm, { orgId: org.id, onDone: () => {
                    setShowAdd(false);
                    onUpdated();
                } })) : null, _jsxs("table", { className: "mt-4 w-full text-sm", children: [_jsx("thead", { className: "text-left text-slate-500", children: _jsxs("tr", { children: [_jsx("th", { className: "py-2", children: "\u0418\u043C\u044F" }), _jsx("th", { className: "py-2", children: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D" }), _jsx("th", { className: "py-2", children: "\u0420\u043E\u043B\u044C" }), _jsx("th", { className: "py-2", children: "PIN" }), _jsx("th", { className: "py-2 text-right" })] }) }), _jsx("tbody", { children: org.employees.map((emp) => (_jsx(EmployeeRow, { orgId: org.id, emp: emp, onUpdated: onUpdated }, emp.id))) })] })] }));
}
function EmployeeRow({ orgId, emp, onUpdated }) {
    const [editingPin, setEditingPin] = useState(false);
    const [newPin, setNewPin] = useState("");
    const [error, setError] = useState("");
    const savePin = useMutation({
        mutationFn: async () => {
            await superApi.patch(`/super/orgs/${orgId}/users/${emp.id}`, { pin_code: newPin });
        },
        onSuccess: () => {
            setEditingPin(false);
            setNewPin("");
            onUpdated();
        },
        onError: (err) => setError(extractError(err, "Ошибка сохранения PIN")),
    });
    const remove = useMutation({
        mutationFn: async () => {
            await superApi.delete(`/super/orgs/${orgId}/users/${emp.id}`);
        },
        onSuccess: onUpdated,
        onError: (err) => setError(extractError(err, "Не удалось удалить сотрудника")),
    });
    return (_jsxs("tr", { className: "border-t", children: [_jsx("td", { className: "py-2 font-medium text-slate-900", children: emp.name }), _jsx("td", { className: "py-2 text-slate-600", children: emp.phone }), _jsx("td", { className: "py-2 text-slate-600", children: emp.role }), _jsx("td", { className: "py-2", children: editingPin ? (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("input", { className: "w-24 rounded border p-1 font-mono text-sm", value: newPin, onChange: (e) => setNewPin(e.target.value), inputMode: "numeric", pattern: "\\d{4,6}", placeholder: "\u043D\u043E\u0432\u044B\u0439 PIN" }), _jsx("button", { onClick: () => {
                                setError("");
                                savePin.mutate();
                            }, disabled: savePin.isPending || !newPin, className: "rounded bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50", children: "\u041E\u041A" }), _jsx("button", { onClick: () => {
                                setEditingPin(false);
                                setNewPin("");
                            }, className: "text-xs text-slate-500", children: "\u043E\u0442\u043C\u0435\u043D\u0430" })] })) : (_jsx("span", { className: "text-slate-500", children: emp.has_pin ? "••••" : "не задан" })) }), _jsxs("td", { className: "py-2 text-right", children: [!editingPin ? (_jsxs("div", { className: "flex justify-end gap-3", children: [_jsx("button", { onClick: () => setEditingPin(true), className: "text-xs text-blue-600 hover:underline", children: "\u0421\u043C\u0435\u043D\u0438\u0442\u044C PIN" }), _jsx("button", { onClick: () => {
                                    if (window.confirm(`Удалить сотрудника «${emp.name}»?`)) {
                                        setError("");
                                        remove.mutate();
                                    }
                                }, className: "text-xs text-rose-600 hover:underline", disabled: remove.isPending, children: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C" })] })) : null, error ? _jsx("div", { className: "mt-1 text-xs text-rose-600", children: error }) : null] })] }));
}
function AddEmployeeForm({ orgId, onDone }) {
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [role, setRole] = useState("seller");
    const [pin, setPin] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const create = useMutation({
        mutationFn: async () => {
            await superApi.post(`/super/orgs/${orgId}/users`, {
                name,
                phone,
                role,
                pin_code: pin,
                password,
            });
        },
        onSuccess: () => {
            setName("");
            setPhone("");
            setPin("");
            setPassword("");
            setRole("seller");
            onDone();
        },
        onError: (err) => setError(extractError(err, "Не удалось добавить сотрудника")),
    });
    const onSubmit = (e) => {
        e.preventDefault();
        setError("");
        create.mutate();
    };
    return (_jsxs("form", { onSubmit: onSubmit, className: "mt-4 grid grid-cols-1 gap-3 rounded-xl border bg-slate-50 p-4 md:grid-cols-5", children: [_jsx("input", { className: "rounded-lg border p-2", placeholder: "\u0418\u043C\u044F", value: name, onChange: (e) => setName(e.target.value), required: true }), _jsx("input", { className: "rounded-lg border p-2", placeholder: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D +996...", value: phone, onChange: (e) => setPhone(e.target.value), required: true }), _jsxs("select", { className: "rounded-lg border p-2", value: role, onChange: (e) => setRole(e.target.value), children: [_jsx("option", { value: "seller", children: "\u041F\u0440\u043E\u0434\u0430\u0432\u0435\u0446" }), _jsx("option", { value: "warehouse", children: "\u0421\u043A\u043B\u0430\u0434" }), _jsx("option", { value: "owner", children: "\u0412\u043B\u0430\u0434\u0435\u043B\u0435\u0446" })] }), _jsx("input", { className: "rounded-lg border p-2 font-mono", placeholder: "PIN 4-6 \u0446\u0438\u0444\u0440", value: pin, onChange: (e) => setPin(e.target.value), inputMode: "numeric", pattern: "\\d{4,6}", required: true }), _jsx("input", { className: "rounded-lg border p-2", type: "password", placeholder: "\u041F\u0430\u0440\u043E\u043B\u044C", value: password, onChange: (e) => setPassword(e.target.value), minLength: 4, required: true }), error ? _jsx("p", { className: "md:col-span-5 text-sm text-rose-600", children: error }) : null, _jsx("button", { type: "submit", disabled: create.isPending, className: "md:col-span-5 rounded-lg bg-slate-900 p-2 text-sm font-semibold text-white disabled:opacity-50", children: create.isPending ? "Сохраняем..." : "Добавить сотрудника" })] }));
}
