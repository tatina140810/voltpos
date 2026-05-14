from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Iterable

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from app.config import settings


def _register_font() -> str:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/Library/Fonts/DejaVuSans.ttf",
    ]
    for font_path in candidates:
        if Path(font_path).exists():
            pdfmetrics.registerFont(TTFont("DejaVuSans", font_path))
            return "DejaVuSans"
    return "Helvetica"


def generate_receipt_pdf(
    sale_id: int,
    sale_date: datetime,
    seller_name: str,
    customer_name: str | None,
    items: Iterable[tuple[str, int, Decimal]],
    subtotal: Decimal,
    discount_amount: Decimal,
    delivery_price: Decimal,
    installation_price: Decimal,
    total: Decimal,
    paid_cash: Decimal,
    paid_card: Decimal,
    paid_transfer: Decimal,
) -> str:
    font_name = _register_font()
    output_dir = Path(settings.upload_dir) / "receipts"
    output_dir.mkdir(parents=True, exist_ok=True)
    file_path = output_dir / f"{sale_id}.pdf"

    c = canvas.Canvas(str(file_path), pagesize=A4)
    width, _ = A4

    # Header
    c.setFont(font_name, 18)
    c.drawString(50, 800, settings.store_name)
    c.setFont(font_name, 10)
    c.drawString(50, 783, settings.store_contacts)
    if settings.store_logo_path and Path(settings.store_logo_path).exists():
        c.drawImage(settings.store_logo_path, 430, 760, width=120, height=60, preserveAspectRatio=True)

    c.setFont(font_name, 14)
    c.drawString(50, 750, f"Чек № {sale_id}")
    c.setFont(font_name, 10)
    c.drawString(50, 733, f"Дата: {sale_date.strftime('%d.%m.%Y %H:%M')}")
    c.drawString(50, 718, f"Продавец: {seller_name}")
    if customer_name:
        c.drawString(50, 703, f"Клиент: {customer_name}")

    # Items table
    y = 670
    c.setFont(font_name, 11)
    c.drawString(50, y, "Товар")
    c.drawString(330, y, "Кол-во")
    c.drawString(400, y, "Цена")
    c.drawString(490, y, "Сумма")
    c.line(50, y - 4, width - 50, y - 4)
    y -= 20
    c.setFont(font_name, 10)
    for name, qty, price in items:
        if y < 150:
            c.showPage()
            c.setFont(font_name, 10)
            y = 800
        line_total = price * qty
        # Truncate long product names so they fit before the qty column.
        display_name = name if len(name) <= 40 else name[:37] + "..."
        c.drawString(50, y, display_name)
        c.drawString(330, y, str(qty))
        c.drawRightString(470, y, f"{price:.2f}")
        c.drawRightString(560, y, f"{line_total:.2f}")
        y -= 16

    # Totals
    y -= 10
    c.line(50, y, width - 50, y)
    y -= 18
    c.setFont(font_name, 10)
    c.drawString(50, y, "Подытог")
    c.drawRightString(560, y, f"{subtotal:.2f} сом")
    y -= 14
    if discount_amount > 0:
        c.drawString(50, y, "Скидка")
        c.drawRightString(560, y, f"-{discount_amount:.2f} сом")
        y -= 14
    if delivery_price > 0:
        c.drawString(50, y, "Доставка")
        c.drawRightString(560, y, f"{delivery_price:.2f} сом")
        y -= 14
    if installation_price > 0:
        c.drawString(50, y, "Установка")
        c.drawRightString(560, y, f"{installation_price:.2f} сом")
        y -= 14
    c.setFont(font_name, 14)
    c.drawString(50, y - 4, "ИТОГО")
    c.drawRightString(560, y - 4, f"{total:.2f} сом")
    y -= 28

    # Payment breakdown
    c.setFont(font_name, 10)
    if paid_cash > 0:
        c.drawString(50, y, f"Наличные: {paid_cash:.2f} сом")
        y -= 14
    if paid_card > 0:
        c.drawString(50, y, f"Карта: {paid_card:.2f} сом")
        y -= 14
    if paid_transfer > 0:
        c.drawString(50, y, f"Перевод: {paid_transfer:.2f} сом")
        y -= 14

    # Footer
    c.setFont(font_name, 9)
    c.drawCentredString(width / 2, 60, "Спасибо за покупку!")

    c.showPage()
    c.save()

    return str(file_path)
