from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import TENANT_MODELS
from app.middleware.tenant import TenantMiddleware
from app.models import Customer, DebtPayment, Delivery, Installment, Product, PushSubscription, Repair, Sale, StockMovement, Supplier, User, Warranty
from app.models.cash_withdrawal import CashWithdrawal
from app.routers import auth, cash_withdrawals, customers, deliveries, org, period_expenses, products, push, reports, revisions, sales, scan, shifts, stock, suppliers, super as super_router, super_auth, warranty

app = FastAPI(title="VoltPos API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(TenantMiddleware)

TENANT_MODELS[:] = [User, Product, StockMovement, Customer, Sale, Delivery, Repair, Installment, Warranty, CashWithdrawal, PushSubscription, Supplier, DebtPayment]

app.include_router(auth.router)
app.include_router(products.router)
app.include_router(stock.router)
app.include_router(customers.router)
app.include_router(sales.router)
app.include_router(warranty.router)
app.include_router(reports.router)
app.include_router(period_expenses.router)
app.include_router(deliveries.router)
app.include_router(shifts.router)
app.include_router(scan.router)
app.include_router(revisions.router)
app.include_router(org.router)
app.include_router(cash_withdrawals.router)
app.include_router(push.router)
app.include_router(suppliers.router)
app.include_router(super_auth.router)
app.include_router(super_router.router)


@app.get("/health")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
