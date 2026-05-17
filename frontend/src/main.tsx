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
import { OrdersPage } from "./pages/Orders";
import { SuperLoginPage } from "./pages/super/SuperLogin";
import { SuperLayout } from "./pages/super/SuperLayout";
import { SuperDashboard } from "./pages/super/SuperDashboard";
import { SuperOrgsList } from "./pages/super/SuperOrgsList";
import { SuperOrgCreate } from "./pages/super/SuperOrgCreate";
import { SuperOrgDetails } from "./pages/super/SuperOrgDetails";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/super/login" element={<SuperLoginPage />} />
          <Route path="/super" element={<SuperLayout />}>
            <Route index element={<SuperDashboard />} />
            <Route path="orgs" element={<SuperOrgsList />} />
            <Route path="orgs/new" element={<SuperOrgCreate />} />
            <Route path="orgs/:id" element={<SuperOrgDetails />} />
          </Route>
          <Route element={<Layout />}>
            <Route path="/sale" element={<SalePage />} />
            <Route path="/stock" element={<StockPage />} />
            <Route path="/suppliers" element={<SuppliersPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/deliveries" element={<DeliveriesPage />} />
            <Route path="/cash-withdrawals" element={<CashWithdrawalsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/scan" element={<ScanInvoicePage />} />
            <Route path="/revisions" element={<RevisionsPage />} />
            <Route path="/revisions/active" element={<RevisionActivePage />} />
            <Route path="/revisions/:id/report" element={<RevisionReportPage />} />
            <Route path="/orders" element={<OrdersPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/sale" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register service worker for PWA install + offline support.
// Skip in dev to avoid HMR conflicts.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("SW registration failed:", err);
    });
  });
}
