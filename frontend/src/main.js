import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./styles.css";
import { Layout } from "./components/Layout";
import { CashWithdrawalsPage } from "./pages/CashWithdrawals";
import { CustomersPage } from "./pages/Customers";
import { DeliveriesPage } from "./pages/Deliveries";
import { LoginPage } from "./pages/Login";
import { ProductsPage } from "./pages/Products";
import { ReportsPage } from "./pages/Reports";
import { SalePage } from "./pages/Sale";
import { StockPage } from "./pages/Stock";
import { Suppliers as SuppliersPage } from "./pages/Suppliers";
import { EmployeesPage } from "./pages/Employees";
import { ScanInvoicePage } from "./pages/ScanInvoice";
import { RevisionsPage } from "./pages/Revisions";
import { RevisionActivePage } from "./pages/RevisionActive";
import { RevisionReportPage } from "./pages/RevisionReport";
import { SuperLoginPage } from "./pages/super/SuperLogin";
import { SuperLayout } from "./pages/super/SuperLayout";
import { SuperDashboard } from "./pages/super/SuperDashboard";
import { SuperOrgsList } from "./pages/super/SuperOrgsList";
import { SuperOrgCreate } from "./pages/super/SuperOrgCreate";
import { SuperOrgDetails } from "./pages/super/SuperOrgDetails";
const queryClient = new QueryClient();
function App() {
    return (_jsx(QueryClientProvider, { client: queryClient, children: _jsx(BrowserRouter, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { path: "/super/login", element: _jsx(SuperLoginPage, {}) }), _jsxs(Route, { path: "/super", element: _jsx(SuperLayout, {}), children: [_jsx(Route, { index: true, element: _jsx(SuperDashboard, {}) }), _jsx(Route, { path: "orgs", element: _jsx(SuperOrgsList, {}) }), _jsx(Route, { path: "orgs/new", element: _jsx(SuperOrgCreate, {}) }), _jsx(Route, { path: "orgs/:id", element: _jsx(SuperOrgDetails, {}) })] }), _jsxs(Route, { element: _jsx(Layout, {}), children: [_jsx(Route, { path: "/sale", element: _jsx(SalePage, {}) }), _jsx(Route, { path: "/stock", element: _jsx(StockPage, {}) }), _jsx(Route, { path: "/suppliers", element: _jsx(SuppliersPage, {}) }), _jsx(Route, { path: "/products", element: _jsx(ProductsPage, {}) }), _jsx(Route, { path: "/customers", element: _jsx(CustomersPage, {}) }), _jsx(Route, { path: "/deliveries", element: _jsx(DeliveriesPage, {}) }), _jsx(Route, { path: "/cash-withdrawals", element: _jsx(CashWithdrawalsPage, {}) }), _jsx(Route, { path: "/reports", element: _jsx(ReportsPage, {}) }), _jsx(Route, { path: "/employees", element: _jsx(EmployeesPage, {}) }), _jsx(Route, { path: "/scan", element: _jsx(ScanInvoicePage, {}) }), _jsx(Route, { path: "/revisions", element: _jsx(RevisionsPage, {}) }), _jsx(Route, { path: "/revisions/active", element: _jsx(RevisionActivePage, {}) }), _jsx(Route, { path: "/revisions/:id/report", element: _jsx(RevisionReportPage, {}) })] }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/sale", replace: true }) })] }) }) }));
}
ReactDOM.createRoot(document.getElementById("root")).render(_jsx(React.StrictMode, { children: _jsx(App, {}) }));
// Register service worker for PWA install + offline support.
// Skip in dev to avoid HMR conflicts.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch((err) => {
            console.warn("SW registration failed:", err);
        });
    });
}
