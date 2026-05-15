import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { BarChart3, Boxes, Building2, ClipboardList, LogOut, Menu as MenuIcon, Package, ScanLine, ShoppingCart, Truck, UserCog, Users, Wallet, X, } from "lucide-react";
import { useBusinessSettings } from "../hooks/useBusinessSettings";
import { syncOfflineSales } from "../lib/offline";
import { useAuthStore } from "../store/auth";
import { OfflineBanner } from "./OfflineBanner";
/** Иконка таб-бара/сайдбара по маршруту. Один источник истины — менять здесь. */
const ROUTE_ICONS = {
    "/sale": ShoppingCart,
    "/stock": Package,
    "/suppliers": Building2,
    "/products": Boxes,
    "/customers": Users,
    "/deliveries": Truck,
    "/cash-withdrawals": Wallet,
    "/reports": BarChart3,
    "/employees": UserCog,
    "/scan": ScanLine,
    "/revisions": ClipboardList,
};
const item = (to, label) => ({ to, label, Icon: ROUTE_ICONS[to] });
// Полный список всех пунктов меню в порядке отображения.
// Ниже фильтруется по роли + overrides.
const ALL_ITEMS = [
    item("/sale", "Касса"),
    item("/stock", "Склад"),
    item("/scan", "Скан накладной"),
    item("/revisions", "Ревизия"),
    item("/suppliers", "Поставщики"),
    item("/products", "Товары"),
    item("/customers", "Клиенты"),
    item("/deliveries", "Доставки"),
    item("/cash-withdrawals", "Инкас."),
    item("/reports", "Отчёты"),
    item("/employees", "Сотрудники"),
];
// Дефолтный набор путей для каждой роли — что видит сотрудник, если владелец не настраивал.
const DEFAULT_ALLOWED = {
    seller: new Set(["/sale", "/customers", "/deliveries", "/cash-withdrawals"]),
    warehouse: new Set(["/stock", "/products", "/suppliers", "/revisions"]),
    owner: new Set(ALL_ITEMS.map((m) => m.to)),
};
const ROLE_LABEL = {
    owner: "Владелец",
    seller: "Продавец",
    warehouse: "Склад",
};
export function Layout() {
    const role = useAuthStore((s) => s.role);
    const token = useAuthStore((s) => s.token);
    const setAuth = useAuthStore((s) => s.setAuth);
    const queryClient = useQueryClient();
    const { orgName, type: businessType, hasDelivery, hasInvoiceScan } = useBusinessSettings();
    const isGrocery = businessType === "grocery";
    const meQuery = useQuery({
        queryKey: ["auth-me"],
        enabled: !!token,
        queryFn: async () => (await api.get("/auth/me")).data,
    });
    const overrides = meQuery.data?.menu_overrides ?? null;
    const myName = meQuery.data?.name ?? "";
    const myRoleLabel = ROLE_LABEL[meQuery.data?.role ?? role] ?? meQuery.data?.role ?? role;
    // Строим меню из ПОЛНОГО списка пунктов: для каждого решаем, показывать или нет.
    // Источник истины: override (если задан) поверх дефолта роли.
    const defaultAllowed = DEFAULT_ALLOWED[role] ?? new Set();
    const menu = ALL_ITEMS.filter((m) => {
        // Поставщики — только для продуктовых магазинов.
        if (m.to === "/suppliers" && !isGrocery)
            return false;
        // Доставки — только если модуль включён в настройках магазина.
        if (m.to === "/deliveries" && !hasDelivery)
            return false;
        // Сканирование накладной — платная фича, включается супер-админом.
        if (m.to === "/scan") {
            if (!hasInvoiceScan)
                return false;
            return role === "owner" || role === "warehouse";
        }
        // Ревизия — owner и warehouse, всегда (не зависит от модулей).
        if (m.to === "/revisions")
            return role === "owner" || role === "warehouse";
        // Сотрудники — только владельцу.
        if (m.to === "/employees")
            return role === "owner";
        if (overrides && Object.prototype.hasOwnProperty.call(overrides, m.to)) {
            return overrides[m.to] === true;
        }
        return defaultAllowed.has(m.to);
    });
    const location = useLocation();
    const navigate = useNavigate();
    useEffect(() => {
        const handler = () => {
            void syncOfflineSales();
        };
        window.addEventListener("online", handler);
        void syncOfflineSales();
        return () => window.removeEventListener("online", handler);
    }, []);
    const logout = () => {
        setAuth(null);
        queryClient.clear();
        navigate("/login");
    };
    // Приоритет пунктов в нижнем таб-баре: то что чаще всего нужно кассиру/владельцу.
    // Берём первые 4 по этому приоритету (если они есть в menu), остальное — в шторке «Ещё».
    const tabPriority = ["/sale", "/stock", "/customers", "/reports", "/revisions", "/scan", "/cash-withdrawals", "/suppliers", "/products", "/deliveries", "/employees"];
    const ordered = tabPriority
        .map((p) => menu.find((m) => m.to === p))
        .filter((m) => Boolean(m));
    // Дозаполняем хвостом из menu (на случай если в priority что-то забыли).
    for (const m of menu)
        if (!ordered.includes(m))
            ordered.push(m);
    const mainTabs = ordered.slice(0, 4);
    const moreItems = ordered.slice(4);
    const [moreOpen, setMoreOpen] = useState(false);
    return (_jsxs("div", { className: "min-h-screen bg-slate-50", children: [_jsxs("div", { className: "mx-auto flex max-w-7xl gap-4 px-3 py-3 md:px-4", children: [_jsxs("aside", { className: "hidden w-[200px] shrink-0 rounded-2xl bg-white p-3 shadow md:sticky md:top-3 md:flex md:max-h-[calc(100vh-1.5rem)] md:flex-col", children: [_jsxs("div", { style: { padding: "12px 8px" }, children: [_jsx("img", { src: "/logo.png", alt: "VoltPos", style: { height: "40px", width: "auto", objectFit: "contain", margin: "0 auto", display: "block" } }), orgName ? (_jsx("p", { className: "mt-1 text-center text-sm font-semibold text-slate-700", children: orgName })) : null] }), _jsx("nav", { className: "space-y-1", children: menu.map(({ to, label, Icon }) => {
                                    const active = location.pathname === to;
                                    return (_jsxs(Link, { to: to, className: `flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${active ? "bg-indigo-50 text-primary" : "text-slate-700 hover:bg-slate-100"}`, children: [_jsx(Icon, { size: 18, strokeWidth: 1.8 }), _jsx("span", { children: label })] }, to));
                                }) }), _jsxs("div", { className: "mt-auto", children: [myName ? (_jsxs("div", { className: "mb-2 rounded-xl bg-slate-50 px-3 py-2 text-xs", children: [_jsx("p", { className: "truncate font-semibold text-slate-700", title: myName, children: myName }), _jsx("p", { className: "text-slate-500", children: myRoleLabel })] })) : null, _jsxs("button", { onClick: logout, className: "flex w-full items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100", children: [_jsx(LogOut, { size: 18, strokeWidth: 1.8 }), _jsx("span", { children: "\u0412\u044B\u0439\u0442\u0438" })] })] })] }), _jsxs("div", { className: "min-w-0 flex-1 md:pb-0", style: { paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }, children: [_jsx(OfflineBanner, {}), _jsx(Outlet, {})] })] }), _jsxs("nav", { className: "fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t md:hidden", style: {
                    background: "rgba(19, 22, 42, 0.95)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    borderTopColor: "rgba(108,92,231,0.15)",
                    paddingLeft: "8px",
                    paddingRight: "8px",
                    paddingBottom: "calc(8px + env(safe-area-inset-bottom))",
                    paddingTop: "8px",
                }, children: [mainTabs.map(({ to, label, Icon }) => (_jsx(TabButton, { to: to, label: label, Icon: Icon, active: location.pathname === to }, to))), moreItems.length > 0 ? (_jsxs("button", { onClick: () => setMoreOpen(true), className: "relative flex min-w-[56px] flex-col items-center justify-center gap-1 rounded-xl border-0 bg-transparent px-3 py-2 transition-transform duration-100 active:scale-[0.92]", style: { color: "#a0a8c0", opacity: 0.6 }, children: [_jsx(MenuIcon, { size: 22, strokeWidth: 1.8 }), _jsx("span", { style: { fontSize: "10px", letterSpacing: "0.2px", fontWeight: 500 }, children: "\u0415\u0449\u0451" })] })) : (_jsxs("button", { onClick: logout, className: "relative flex min-w-[56px] flex-col items-center justify-center gap-1 rounded-xl border-0 bg-transparent px-3 py-2 transition-transform duration-100 active:scale-[0.92]", style: { color: "#a0a8c0", opacity: 0.6 }, children: [_jsx(LogOut, { size: 22, strokeWidth: 1.8 }), _jsx("span", { style: { fontSize: "10px", letterSpacing: "0.2px", fontWeight: 500 }, children: "\u0412\u044B\u0445\u043E\u0434" })] }))] }), moreOpen ? (_jsx("div", { className: "fixed inset-0 z-[60] bg-black/50 md:hidden", onClick: () => setMoreOpen(false), children: _jsxs("div", { className: "absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white p-4 shadow-2xl", style: { paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "mb-2 flex items-center justify-between", children: [_jsx("h3", { className: "text-base font-semibold text-slate-800", children: "\u041C\u0435\u043D\u044E" }), _jsx("button", { onClick: () => setMoreOpen(false), className: "rounded-lg p-1 text-slate-500 hover:bg-slate-100", "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C", children: _jsx(X, { size: 20 }) })] }), myName ? (_jsxs("div", { className: "mb-3 rounded-xl bg-slate-50 px-3 py-2 text-sm", children: [_jsx("p", { className: "truncate font-semibold text-slate-700", children: myName }), _jsx("p", { className: "text-xs text-slate-500", children: myRoleLabel })] })) : null, _jsx("div", { className: "grid grid-cols-3 gap-2", children: moreItems.map(({ to, label, Icon }) => {
                                const active = location.pathname === to;
                                return (_jsxs(Link, { to: to, onClick: () => setMoreOpen(false), className: `flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs ${active
                                        ? "border-primary bg-indigo-50 text-primary"
                                        : "border-slate-200 bg-white text-slate-700"}`, children: [_jsx(Icon, { size: 22, strokeWidth: 1.8 }), _jsx("span", { className: "text-center leading-tight", children: label })] }, to));
                            }) }), _jsxs("button", { onClick: () => { setMoreOpen(false); logout(); }, className: "mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100", children: [_jsx(LogOut, { size: 18, strokeWidth: 1.8 }), _jsx("span", { children: "\u0412\u044B\u0439\u0442\u0438" })] })] }) })) : null] }));
}
/** Один таб-элемент. Активный — на полупрозрачной фиолетовой плашке,
 *  с тонкой полоской-индикатором сверху. */
function TabButton({ to, label, Icon, active, }) {
    return (_jsxs(Link, { to: to, className: "relative flex min-w-[56px] flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 transition-all duration-200 active:scale-[0.92]", style: {
            background: active ? "rgba(108,92,231,0.12)" : "transparent",
            color: active ? "#a29bfe" : "#a0a8c0",
            opacity: active ? 1 : 0.6,
        }, children: [active && (_jsx("span", { "aria-hidden": true, className: "absolute left-1/2 -translate-x-1/2", style: {
                    top: "-1px",
                    width: "20px",
                    height: "2px",
                    background: "#6c5ce7",
                    borderRadius: "0 0 2px 2px",
                } })), _jsx(Icon, { size: 22, strokeWidth: 1.8 }), _jsx("span", { style: {
                    fontSize: "10px",
                    letterSpacing: "0.2px",
                    fontWeight: active ? 600 : 500,
                }, children: label })] }));
}
