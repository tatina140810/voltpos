"""Создание аккаунта владельца (role=owner) в существующей организации.

Запуск с активированным venv из папки backend:
    python -m scripts.create_owner

Скрипт интерактивный: показывает список организаций, имеющихся пользователей,
просит ввести имя/телефон/PIN и создаёт нового owner. Если в организации не
указан owner_id — подставит его автоматически. Безопасно запускать повторно
(проверяет дубль по телефону внутри организации)."""

from __future__ import annotations

import asyncio
import getpass
import random
import re
import string
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.database import SessionLocal
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.utils.security import get_password_hash


def _ask(prompt: str, *, allow_empty: bool = False) -> str:
    while True:
        value = input(prompt).strip()
        if value or allow_empty:
            return value
        print("  Поле не может быть пустым.")


def _ask_pin(prompt: str) -> str:
    """PIN вводится без эха, чтобы не светить в истории терминала."""
    while True:
        pin = getpass.getpass(prompt)
        if not pin.isdigit():
            print("  PIN должен состоять только из цифр.")
            continue
        if not 4 <= len(pin) <= 6:
            print("  PIN должен быть от 4 до 6 цифр.")
            continue
        confirm = getpass.getpass("  Повторите PIN: ")
        if confirm != pin:
            print("  PIN не совпадает, попробуйте ещё раз.")
            continue
        return pin


async def main() -> int:
    async with SessionLocal() as db:
        orgs = list((await db.execute(select(Organization).order_by(Organization.id))).scalars().all())
        if not orgs:
            print("В базе нет ни одной организации. Сначала зарегистрируйте организацию через /auth/register-org.")
            return 1

        print("\nДоступные организации:")
        for o in orgs:
            owner_mark = " [есть owner]" if o.owner_id else " [БЕЗ owner]"
            print(f"  {o.id}: {o.name}  (код: {o.org_code}){owner_mark}")

        while True:
            org_id_str = _ask("\nВведите ID организации, в которую добавить владельца: ")
            if not org_id_str.isdigit():
                print("  Нужно число.")
                continue
            org = next((o for o in orgs if o.id == int(org_id_str)), None)
            if not org:
                print("  Организация с таким ID не найдена.")
                continue
            break

        existing_users = list(
            (await db.execute(select(User).where(User.org_id == org.id, User.is_deleted.is_(False)))).scalars().all()
        )
        if existing_users:
            print(f"\nВ организации '{org.name}' уже есть пользователи:")
            for u in existing_users:
                marker = "  ← OWNER" if u.role == UserRole.owner else ""
                print(f"  #{u.id}  {u.name}  ({u.phone})  role={u.role.value}{marker}")
            existing_owner = next((u for u in existing_users if u.role == UserRole.owner), None)
            if existing_owner:
                print(
                    f"\n⚠️  Владелец уже есть: {existing_owner.name} ({existing_owner.phone}). "
                    "Если забыт PIN — лучше сбросить его существующему владельцу, а не создавать второго.\n"
                    "Продолжить и создать ВТОРОГО владельца? (yes/no): ",
                    end="",
                )
                if input().strip().lower() not in ("yes", "y", "да"):
                    print("Отменено.")
                    return 0

        print("\nДанные нового владельца:")
        name = _ask("  Имя (как будет видно в чеках): ")
        phone = _ask("  Телефон (формат +996...): ")
        if not re.match(r"^\+?\d{9,15}$", phone):
            print(f"  Внимание: телефон '{phone}' не похож на международный формат, всё равно сохранить? (yes/no): ", end="")
            if input().strip().lower() not in ("yes", "y", "да"):
                print("Отменено.")
                return 0

        # Проверка дубля по телефону в этой же организации
        if any(u.phone == phone for u in existing_users):
            print(f"  Телефон {phone} уже занят пользователем в этой организации. Отменено.")
            return 1

        password = getpass.getpass("  Пароль (для входа по логину/паролю): ")
        if len(password) < 6:
            print("  Пароль слишком короткий (минимум 6 символов). Отменено.")
            return 1

        print("  PIN для входа на кассу (4-6 цифр):")
        pin = _ask_pin("  PIN: ")

        print("  PIN для просмотра отчётов (отдельный, рекомендуется другой):")
        report_pin = _ask_pin("  Report-PIN: ")

        owner = User(
            org_id=org.id,
            name=name,
            phone=phone,
            password_hash=get_password_hash(password),
            role=UserRole.owner,
            pin_code=get_password_hash(pin),
            report_pin=get_password_hash(report_pin),
            qr_secret="".join(random.choices(string.ascii_letters + string.digits, k=32)),
            qr_expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        )
        db.add(owner)
        await db.flush()
        if not org.owner_id:
            org.owner_id = owner.id
        await db.commit()

        print("\n✅ Владелец создан.")
        print(f"   ID пользователя: {owner.id}")
        print(f"   Организация:     {org.name}  (код: {org.org_code})")
        print("\nКак войти на воркпейсе voltpos.online:")
        print(f"   1. Откройте сайт → введите код организации: {org.org_code}")
        print(f"   2. Введите PIN, который только что задали.")
        print("   (Если в организации несколько пользователей — система найдёт владельца по PIN.)\n")
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
