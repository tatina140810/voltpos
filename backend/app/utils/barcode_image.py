"""PNG штрихкода EAN-13 для печати и экрана."""
from __future__ import annotations

from io import BytesIO

from barcode import EAN13
from barcode.writer import ImageWriter


def ean13_png_bytes(code: str) -> bytes:
    """Генерирует PNG. code — 12 или 13 цифр EAN-13 (контрольная цифра опциональна)."""
    digits = "".join(c for c in (code or "") if c.isdigit())
    if len(digits) == 13:
        digits = digits[:12]
    if len(digits) != 12:
        raise ValueError("Штрихкод должен содержать 12 или 13 цифр (EAN-13)")
    buf = BytesIO()
    EAN13(digits, writer=ImageWriter()).write(buf)
    return buf.getvalue()
