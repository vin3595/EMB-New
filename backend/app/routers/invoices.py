from datetime import date

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.auth import get_current_user
from app.database import get_database, tenant_db
from app.models.common import utc_now
from app.models.invoice import Invoice, InvoiceCreateRequest
from app.services.escpos import build_escpos_receipt
from app.services.invoice_templates import render_invoice_html
from app.services.notifications import send_email_with_attachment

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


async def _next_invoice_number(tdb) -> str:
    yymm = date.today().strftime("%y%m")
    counter_id = f"INV-{yymm}"
    doc = await tdb.invoice_counters.find_one_and_update(
        {"id": counter_id}, {"$inc": {"seq": 1}, "$setOnInsert": {"created_at": utc_now()}}, upsert=True, return_document=True
    )
    return f"INV-{yymm}-{doc['seq']:04d}"


@router.post("")
async def create_invoice(
    body: InvoiceCreateRequest, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)
):
    tdb = tenant_db(db, user)
    subtotal = 0.0
    cgst = sgst = igst = 0.0
    items = []
    for line in body.items:
        line_total = line.quantity * line.unit_price
        tax_amount = line_total * line.tax_rate / 100
        if body.is_intra_state:
            cgst += tax_amount / 2
            sgst += tax_amount / 2
        else:
            igst += tax_amount
        subtotal += line_total
        line.total = round(line_total + tax_amount, 2)
        items.append(line)

    invoice_number = await _next_invoice_number(tdb)
    invoice = Invoice(
        invoice_number=invoice_number,
        invoice_date=body.invoice_date,
        customer_name=body.customer_name,
        customer_gstin=body.customer_gstin,
        customer_phone=body.customer_phone,
        customer_email=body.customer_email,
        items=items,
        subtotal=round(subtotal, 2),
        cgst_amount=round(cgst, 2),
        sgst_amount=round(sgst, 2),
        igst_amount=round(igst, 2),
        total=round(subtotal + cgst + sgst + igst, 2),
        theme=body.theme,
    )
    await tdb.invoices.insert_one(invoice.model_dump())
    return {"invoice": invoice.model_dump()}


@router.get("")
async def list_invoices(user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    invoices = await tdb.invoices.find({}, {"_id": 0}).sort("invoice_date", -1).to_list(length=None)
    return {"invoices": invoices}


@router.get("/{invoice_id}")
async def get_invoice(invoice_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    invoice = await tdb.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return {"invoice": invoice}


async def _load_invoice_and_company(tdb, invoice_id: str) -> tuple[dict, dict]:
    invoice = await tdb.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    company = await tdb.company_profile.find_one({"id": "profile"}, {"_id": 0}) or {}
    return invoice, company


@router.get("/{invoice_id}/html")
async def invoice_html(
    invoice_id: str, theme: str | None = None, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)
):
    tdb = tenant_db(db, user)
    invoice, company = await _load_invoice_and_company(tdb, invoice_id)
    html = render_invoice_html(invoice, company, theme or invoice.get("theme", "classic"))
    return Response(content=html, media_type="text/html")


@router.get("/{invoice_id}/pdf")
async def invoice_pdf(invoice_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    invoice, company = await _load_invoice_and_company(tdb, invoice_id)
    html = render_invoice_html(invoice, company, invoice.get("theme", "classic"))

    from weasyprint import HTML

    pdf_bytes = HTML(string=html).write_pdf()
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={invoice['invoice_number']}.pdf"},
    )


@router.get("/{invoice_id}/escpos")
async def invoice_escpos(
    invoice_id: str, width: int = 32, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)
):
    tdb = tenant_db(db, user)
    invoice, company = await _load_invoice_and_company(tdb, invoice_id)
    receipt = build_escpos_receipt(invoice, company, width_chars=width)
    return Response(content=receipt, media_type="application/octet-stream", headers={"Content-Disposition": "attachment; filename=receipt.bin"})


@router.post("/{invoice_id}/payment-link")
async def create_payment_link(invoice_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    invoice, company = await _load_invoice_and_company(tdb, invoice_id)
    if not company.get("razorpay_key_id") or not company.get("razorpay_key_secret"):
        raise HTTPException(status_code=400, detail="Razorpay is not configured for this account — add keys in Settings")

    import razorpay

    client = razorpay.Client(auth=(company["razorpay_key_id"], company["razorpay_key_secret"]))
    link = client.payment_link.create(
        {
            "amount": int(round(invoice["total"] * 100)),
            "currency": "INR",
            "description": f"Invoice {invoice['invoice_number']}",
            "customer": {"name": invoice["customer_name"], "contact": invoice.get("customer_phone") or "", "email": invoice.get("customer_email") or ""},
            "notify": {"sms": bool(invoice.get("customer_phone")), "email": bool(invoice.get("customer_email"))},
        }
    )
    await tdb.invoices.update_one({"id": invoice_id}, {"$set": {"razorpay_link": link["short_url"]}})
    return {"payment_link": link["short_url"]}


@router.post("/{invoice_id}/send-email")
async def send_invoice_email(invoice_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    invoice, company = await _load_invoice_and_company(tdb, invoice_id)
    if not invoice.get("customer_email"):
        raise HTTPException(status_code=400, detail="This invoice has no customer email on file")

    html = render_invoice_html(invoice, company, invoice.get("theme", "classic"))
    from weasyprint import HTML as WeasyHTML

    pdf_bytes = WeasyHTML(string=html).write_pdf()
    send_email_with_attachment(
        api_key=company.get("sendgrid_api_key", ""),
        from_email=company.get("email", ""),
        to_email=invoice["customer_email"],
        subject=f"Invoice {invoice['invoice_number']}",
        html_body=f"Please find attached invoice {invoice['invoice_number']}.",
        attachment_bytes=pdf_bytes,
        attachment_name=f"{invoice['invoice_number']}.pdf",
        mime_type="application/pdf",
    )
    return {"ok": True}


@router.post("/{invoice_id}/send-whatsapp")
async def send_invoice_whatsapp(invoice_id: str, user: dict = Depends(get_current_user), db: AsyncIOMotorDatabase = Depends(get_database)):
    tdb = tenant_db(db, user)
    invoice, company = await _load_invoice_and_company(tdb, invoice_id)
    if not invoice.get("customer_phone"):
        raise HTTPException(status_code=400, detail="This invoice has no customer phone on file")
    if not company.get("msg91_auth_key"):
        raise HTTPException(status_code=400, detail="MSG91 is not configured for this account — add an auth key in Settings")

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            "https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
            headers={"authkey": company["msg91_auth_key"], "Content-Type": "application/json"},
            json={
                "messaging_product": "whatsapp",
                "to": invoice["customer_phone"],
                "type": "text",
                "text": {"body": f"Your invoice {invoice['invoice_number']} for {invoice['total']:.2f} is ready. Thank you for your business!"},
            },
        )
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"MSG91 request failed: {resp.text}")
    return {"ok": True}
