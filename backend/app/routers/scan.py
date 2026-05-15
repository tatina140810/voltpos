"""Распознавание приходных накладных по фото через Claude Vision.

Эндпоинт платный: фича включается супер-админом для конкретной организации
(organizations.has_invoice_scan = True). Без флага возвращаем 403.
Сами в БД ничего не пишем — только парсим и отдаём JSON, кассир редактирует
и сохраняет приход обычным способом через /stock/movement.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.invoice_scan_usage import InvoiceScanUsage
from app.models.organization import Organization
from app.models.user import User

router = APIRouter(prefix="/scan", tags=["scan"])
log = logging.getLogger("scan")


@router.get("/quota")
async def get_scan_quota(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Текущее использование квоты сканов накладных за этот месяц."""
    org = (
        await db.execute(select(Organization).where(Organization.id == user.org_id))
    ).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Магазин не найден")
    year_month = datetime.now(timezone.utc).strftime("%Y-%m")
    usage = (
        await db.execute(
            select(InvoiceScanUsage).where(
                InvoiceScanUsage.org_id == user.org_id,
                InvoiceScanUsage.year_month == year_month,
            )
        )
    ).scalar_one_or_none()
    return {
        "enabled": bool(org.has_invoice_scan),
        "used": usage.count if usage else 0,
        "limit": org.invoice_scan_quota or 200,
        "year_month": year_month,
    }

MAX_FILE_BYTES = 10 * 1024 * 1024  # вход — до 10MB, дальше сжимаем под лимит Anthropic.
# Anthropic Vision: лимит base64-payload 5MB. Base64 = +33% к бинарю,
# поэтому таргет на бинарь — около 3.5MB. Берём с запасом 3MB.
ANTHROPIC_BINARY_TARGET = 3 * 1024 * 1024
# Длинная сторона картинки. Для Anthropic рекомендуется ≤1568px — этого хватает
# чтобы прочитать табличку накладной.
ANTHROPIC_MAX_DIM = 1600


def _compress_for_anthropic(image_bytes: bytes) -> tuple[bytes, str]:
    """Перекодируем картинку в JPEG ≤3MB, длинная сторона ≤1600px.
    Возвращает (новые_байты, media_type). Anthropic не любит alpha-каналы — flatten в RGB."""
    img = Image.open(io.BytesIO(image_bytes))
    # EXIF-ориентация: телефон может писать «лежачую» с тегом, чтобы клиент перевернул.
    try:
        from PIL import ImageOps
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGB")
    elif img.mode != "RGB":
        img = img.convert("RGB")

    # Уменьшаем длинную сторону.
    w, h = img.size
    longest = max(w, h)
    if longest > ANTHROPIC_MAX_DIM:
        scale = ANTHROPIC_MAX_DIM / longest
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    # Сохраняем JPEG, постепенно снижая quality пока не уложимся в лимит.
    for quality in (85, 75, 65, 55, 45):
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        data = buf.getvalue()
        if len(data) <= ANTHROPIC_BINARY_TARGET:
            return data, "image/jpeg"
    # Если даже quality=45 не помогло — отдадим как есть (последний JPEG).
    return data, "image/jpeg"

SYSTEM_PROMPT = """Ты — парсер приходных накладных для розничного магазина.
Тебе дают фото накладной (накладная, УПД, счёт-фактура, товарная накладная).

Верни ТОЛЬКО валидный JSON без пояснений, без markdown-разметки, без блоков ```json.

Формат:
{
  "supplier": "название поставщика или null",
  "invoice_number": "номер накладной или null",
  "invoice_date": "дата в формате YYYY-MM-DD или null",
  "items": [
    {
      "name": "название товара",
      "barcode": "штрихкод (EAN-13 или другой) или null",
      "article": "артикул или null",
      "quantity": число,
      "unit": "шт/кг/л/уп и т.д.",
      "price": число (цена закупки за единицу),
      "total": число (сумма строки)
    }
  ],
  "total_amount": число (итоговая сумма всей накладной)
}

Правила:
- Если поле не читается — ставь null.
- quantity, price, total всегда числа (не строки).
- Если штрихкод не виден — barcode: null. Кассир введёт вручную.
- Если в накладной несколько страниц/таблиц — собирай ВСЕ позиции."""


@router.post("/invoice")
async def scan_invoice(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    # 1. Проверяем что у магазина включена фича.
    org = (
        await db.execute(select(Organization).where(Organization.id == user.org_id))
    ).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Магазин не найден")
    if not org.has_invoice_scan:
        raise HTTPException(
            status_code=403,
            detail="Фича сканирования накладных не подключена для вашего магазина. Обратитесь к владельцу платформы.",
        )

    # Проверка месячной квоты. Если использовано ≥ quota — 402 Payment Required.
    # Супер-админ может увеличить лимит за доплату.
    year_month = datetime.now(timezone.utc).strftime("%Y-%m")
    usage = (
        await db.execute(
            select(InvoiceScanUsage).where(
                InvoiceScanUsage.org_id == user.org_id,
                InvoiceScanUsage.year_month == year_month,
            )
        )
    ).scalar_one_or_none()
    used_count = usage.count if usage else 0
    quota = org.invoice_scan_quota or 200
    if used_count >= quota:
        raise HTTPException(
            status_code=402,
            detail=(
                f"Месячный лимит распознавания накладных исчерпан "
                f"({used_count}/{quota} за {year_month}). "
                f"Чтобы продолжить — обратитесь к владельцу платформы для увеличения квоты."
            ),
        )

    # 2. Базовая валидация файла.
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Только изображения (jpg, png, webp)")
    media_type = file.content_type
    if media_type not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        raise HTTPException(status_code=400, detail=f"Неподдерживаемый тип изображения: {media_type}")

    image_data = await file.read()
    if len(image_data) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail=f"Файл больше {MAX_FILE_BYTES // (1024 * 1024)} МБ")
    if len(image_data) < 100:
        raise HTTPException(status_code=400, detail="Файл слишком маленький, похоже на ошибку загрузки")

    # Anthropic режет base64 > 5MB. Сжимаем: ресайз до 1600px + JPEG q85→...→q45.
    # Заодно нормализуем формат (в jpeg) и снимаем EXIF-ориентацию.
    try:
        image_data, media_type = _compress_for_anthropic(image_data)
    except Exception as exc:
        log.exception("Image compression failed")
        raise HTTPException(status_code=400, detail=f"Не удалось обработать изображение: {exc}") from exc

    # 3. Импорт SDK ленивый — чтобы при отсутствующем ANTHROPIC_API_KEY API всё равно стартовал.
    try:
        from anthropic import Anthropic
    except ImportError:
        raise HTTPException(status_code=500, detail="anthropic SDK не установлен на сервере")

    api_key = settings.anthropic_api_key
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="ANTHROPIC_API_KEY не настроен на сервере",
        )

    client = Anthropic(api_key=api_key)
    base64_image = base64.standard_b64encode(image_data).decode("utf-8")

    # 4. Запрос к Claude Sonnet (поддерживает vision и хорошо парсит таблицы).
    # Anthropic SDK синхронный — ОБЯЗАТЕЛЬНО оборачиваем в to_thread,
    # иначе event loop FastAPI заблокируется на 30-60 сек распознавания
    # и вся касса (продажи, отчёты, всё) встанет.
    def _call_claude() -> Any:
        return client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=4000,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": base64_image,
                            },
                        },
                        {"type": "text", "text": "Распарси эту накладную и верни JSON."},
                    ],
                }
            ],
        )

    try:
        response = await asyncio.to_thread(_call_claude)
    except Exception as exc:
        log.exception("Anthropic API error")
        raise HTTPException(status_code=502, detail=f"Сервис распознавания недоступен: {exc}") from exc

    # 5. Парсим ответ. Claude иногда оборачивает в ```json — снимем.
    raw = (response.content[0].text or "").strip()
    if raw.startswith("```"):
        # снимаем ```json ... ```
        lines = raw.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw = "\n".join(lines).strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=422,
            detail=f"Распознавание вернуло не JSON: {raw[:300]}",
        )

    # Успех — инкрементим счётчик. Делаем upsert: одна запись на (org, месяц).
    now = datetime.now(timezone.utc)
    if usage:
        usage.count += 1
        usage.updated_at = now
    else:
        db.add(InvoiceScanUsage(
            org_id=user.org_id,
            year_month=year_month,
            count=1,
            updated_at=now,
        ))
    await db.commit()

    # Отдаём фронту текущий статус квоты — чтобы показывать прогресс «12 / 200».
    parsed["_quota"] = {"used": used_count + 1, "limit": quota, "year_month": year_month}
    return parsed
