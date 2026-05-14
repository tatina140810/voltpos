import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { extractError } from "../../lib/extractError";
import { superApi } from "../../lib/superApi";
import { STORE_CATEGORY_GROUPS } from "../../lib/storeCategories";
const initial = {
    name: "",
    slug: "",
    category: "",
    monthly_fee: "",
    paid_until: "",
    owner_name: "",
    owner_phone: "",
    owner_password: "",
    owner_pin: "",
    owner_report_pin: "",
};
function slugify(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9а-я]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 100);
}
export function SuperOrgCreate() {
    const navigate = useNavigate();
    const [form, setForm] = useState(initial);
    const [error, setError] = useState("");
    const mutation = useMutation({
        mutationFn: async () => {
            const payload = {
                name: form.name.trim(),
                slug: form.slug.trim() || slugify(form.name),
                category: form.category || null,
                monthly_fee: form.monthly_fee ? Number(form.monthly_fee) : null,
                paid_until: form.paid_until || null,
                owner_name: form.owner_name.trim(),
                owner_phone: form.owner_phone.trim(),
                owner_password: form.owner_password,
                owner_pin: form.owner_pin,
                owner_report_pin: form.owner_report_pin,
            };
            const response = await superApi.post("/super/orgs", payload);
            return response.data;
        },
        onSuccess: (data) => {
            navigate(`/super/orgs/${data.id}`);
        },
        onError: (err) => setError(extractError(err, "Не удалось создать магазин")),
    });
    const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
    const onSubmit = (event) => {
        event.preventDefault();
        setError("");
        mutation.mutate();
    };
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h1", { className: "text-2xl font-bold text-slate-900", children: "\u041D\u043E\u0432\u044B\u0439 \u043C\u0430\u0433\u0430\u0437\u0438\u043D" }), _jsx(Link, { to: "/super/orgs", className: "text-sm text-slate-500 hover:underline", children: "\u2190 \u041A \u0441\u043F\u0438\u0441\u043A\u0443" })] }), _jsxs("form", { onSubmit: onSubmit, className: "space-y-6 rounded-2xl border bg-white p-6 shadow-sm", children: [_jsxs("section", { className: "space-y-4", children: [_jsx("h2", { className: "text-sm font-semibold uppercase tracking-wide text-slate-500", children: "\u041C\u0430\u0433\u0430\u0437\u0438\u043D" }), _jsxs("div", { className: "grid grid-cols-1 gap-4 md:grid-cols-2", children: [_jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1 block text-sm text-slate-600", children: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435" }), _jsx("input", { className: "w-full rounded-lg border p-2.5", value: form.name, onChange: update("name"), required: true })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1 block text-sm text-slate-600", children: "Slug (\u043B\u0430\u0442\u0438\u043D\u0438\u0446\u0430, \u0431\u0435\u0437 \u043F\u0440\u043E\u0431\u0435\u043B\u043E\u0432)" }), _jsx("input", { className: "w-full rounded-lg border p-2.5 font-mono text-sm", value: form.slug, onChange: update("slug"), placeholder: slugify(form.name) || "ogonek", pattern: "[a-z0-9-]+" })] }), _jsxs("label", { className: "block md:col-span-2", children: [_jsx("span", { className: "mb-1 block text-sm text-slate-600", children: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0430" }), _jsxs("select", { className: "w-full rounded-lg border bg-white p-2.5", value: form.category, onChange: update("category"), children: [_jsx("option", { value: "", children: "\u2014 \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u0430 \u2014" }), STORE_CATEGORY_GROUPS.map((group) => (_jsx("optgroup", { label: group.label, children: group.items.map((item) => (_jsx("option", { value: item, children: item }, item))) }, group.label)))] })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1 block text-sm text-slate-600", children: "\u0426\u0435\u043D\u0430 \u0432 \u043C\u0435\u0441\u044F\u0446, \u20BD" }), _jsx("input", { className: "w-full rounded-lg border p-2.5", type: "number", min: 0, value: form.monthly_fee, onChange: update("monthly_fee"), placeholder: "3000" })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1 block text-sm text-slate-600", children: "\u041E\u043F\u043B\u0430\u0447\u0435\u043D\u043E \u0434\u043E" }), _jsx("input", { className: "w-full rounded-lg border p-2.5", type: "date", value: form.paid_until, onChange: update("paid_until") })] })] })] }), _jsxs("section", { className: "space-y-4 border-t pt-6", children: [_jsx("h2", { className: "text-sm font-semibold uppercase tracking-wide text-slate-500", children: "\u0412\u043B\u0430\u0434\u0435\u043B\u0435\u0446 (owner)" }), _jsxs("div", { className: "grid grid-cols-1 gap-4 md:grid-cols-2", children: [_jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1 block text-sm text-slate-600", children: "\u0418\u043C\u044F" }), _jsx("input", { className: "w-full rounded-lg border p-2.5", value: form.owner_name, onChange: update("owner_name"), required: true })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1 block text-sm text-slate-600", children: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D" }), _jsx("input", { className: "w-full rounded-lg border p-2.5", value: form.owner_phone, onChange: update("owner_phone"), placeholder: "+996...", required: true })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1 block text-sm text-slate-600", children: "\u041F\u0430\u0440\u043E\u043B\u044C (\u0434\u043B\u044F \u043B\u043E\u0433\u0438\u043D\u0430)" }), _jsx("input", { className: "w-full rounded-lg border p-2.5", type: "password", value: form.owner_password, onChange: update("owner_password"), minLength: 4, required: true })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1 block text-sm text-slate-600", children: "PIN \u043A\u0430\u0441\u0441\u044B (4-6 \u0446\u0438\u0444\u0440)" }), _jsx("input", { className: "w-full rounded-lg border p-2.5 font-mono", value: form.owner_pin, onChange: update("owner_pin"), inputMode: "numeric", pattern: "\\d{4,6}", required: true })] }), _jsxs("label", { className: "block", children: [_jsx("span", { className: "mb-1 block text-sm text-slate-600", children: "Report PIN (\u0434\u043B\u044F \u043E\u0442\u0447\u0451\u0442\u043E\u0432)" }), _jsx("input", { className: "w-full rounded-lg border p-2.5 font-mono", value: form.owner_report_pin, onChange: update("owner_report_pin"), inputMode: "numeric", pattern: "\\d{4,6}", required: true })] })] })] }), error ? _jsx("p", { className: "text-sm text-rose-600", children: error }) : null, _jsxs("div", { className: "flex justify-end gap-3", children: [_jsx(Link, { to: "/super/orgs", className: "rounded-lg border px-4 py-2 text-sm text-slate-700 hover:bg-slate-50", children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx("button", { type: "submit", disabled: mutation.isPending, className: "rounded-lg bg-slate-900 px-6 py-2 text-sm font-semibold text-white disabled:opacity-50", children: mutation.isPending ? "Создаём..." : "Создать магазин" })] })] })] }));
}
