"""Создание администратора платформы (PlatformAdmin) — глобальный супер-юзер,
который заходит на /super и управляет всеми магазинами.

Запуск с активированным venv из папки backend:
    python -m scripts.create_platform_admin

Скрипт интерактивный: спрашивает email, имя и пароль (без эха), создаёт запись
в таблице platform_admins. Безопасно запускать несколько раз — проверяет дубль
по email.
"""

from __future__ import annotations

import asyncio
import getpass
import re
import sys

from sqlalchemy import select

from app.database import SessionLocal
from app.models.platform_admin import PlatformAdmin
from app.utils.security import get_password_hash


def _ask(prompt: str) -> str:
    while True:
        value = input(prompt).strip()
        if value:
            return value
        print("  Поле не может быть пустым.")


def _ask_password(prompt: str) -> str:
    while True:
        pwd = getpass.getpass(prompt)
        if len(pwd) < 8:
            print("  Пароль должен быть не короче 8 символов.")
            continue
        confirm = getpass.getpass("  Повторите пароль: ")
        if confirm != pwd:
            print("  Пароли не совпадают, попробуйте снова.")
            continue
        return pwd


async def main() -> int:
    print("Создание администратора платформы (вход на /super).\n")
    email = _ask("Email: ").lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        print("  Это не похоже на email. Отменено.")
        return 1

    async with SessionLocal() as db:
        existing = (
            await db.execute(select(PlatformAdmin).where(PlatformAdmin.email == email))
        ).scalar_one_or_none()
        if existing:
            print(f"  Администратор с email {email} уже существует (id={existing.id}). Отменено.")
            return 1

        name = _ask("Имя: ")
        password = _ask_password("Пароль (минимум 8 символов): ")

        admin = PlatformAdmin(
            email=email,
            name=name,
            password_hash=get_password_hash(password),
        )
        db.add(admin)
        await db.commit()
        await db.refresh(admin)

        print(f"\n✅ Администратор создан. id={admin.id}, email={admin.email}")
        print("   Открой https://voltpos.online/super и войди по email+паролю.")
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
