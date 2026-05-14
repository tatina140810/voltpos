from datetime import datetime
from pathlib import Path

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


def generate_warranty_pdf(
    warranty_id: int,
    product_name: str,
    serial_number: str | None,
    sale_date: datetime,
    expires_at: datetime,
) -> str:
    font_name = _register_font()
    output_dir = Path(settings.upload_dir) / "warranties"
    output_dir.mkdir(parents=True, exist_ok=True)
    file_path = output_dir / f"{warranty_id}.pdf"

    c = canvas.Canvas(str(file_path), pagesize=A4)
    c.setFont(font_name, 18)
    c.drawString(50, 800, f"Гарантийный талон — {settings.store_name}")
    c.setFont(font_name, 12)
    c.drawString(50, 770, f"Товар: {product_name}")
    c.drawString(50, 745, f"Серийный номер: {serial_number or '-'}")
    c.drawString(50, 720, f"Дата покупки: {sale_date.strftime('%d.%m.%Y')}")
    c.drawString(50, 695, f"Гарантия до: {expires_at.strftime('%d.%m.%Y')}")
    c.drawString(50, 670, f"Контакты магазина: {settings.store_contacts}")
    if settings.store_logo_path and Path(settings.store_logo_path).exists():
        c.drawImage(settings.store_logo_path, 430, 760, width=120, height=60, preserveAspectRatio=True)
    c.showPage()
    c.save()

    return f"{settings.base_url}/uploads/warranties/{warranty_id}.pdf"
