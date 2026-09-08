import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import db
from app.routers import admin, auth, bills, dashboard, daily_sheets, invoices, items, recipes, settings as settings_router, staff, vouchers

logging.basicConfig(level=logging.INFO)
settings = get_settings()

app = FastAPI(title="EaseMyBill API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(bills.router)
app.include_router(daily_sheets.router)
app.include_router(vouchers.router)
app.include_router(items.router)
app.include_router(recipes.router)
app.include_router(staff.router)
app.include_router(dashboard.router)
app.include_router(invoices.router)
app.include_router(settings_router.router)
app.include_router(admin.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.on_event("startup")
async def ensure_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
