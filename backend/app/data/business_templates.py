"""Шаблоны бизнеса для Volt-Pos. Каждый шаблон содержит пресет модулей,
доступные единицы измерения и подсказки категорий товаров. Это лишь дефолты —
после применения шаблона владелец может включить/выключить любой модуль вручную.

Шаблон применяется через POST /super/orgs/{id}/business-type → modules
копируются в Organization.business_settings.modules. Уже существующие магазины
с business_type=NULL получают все модули включёнными по fallback на фронте."""

from __future__ import annotations

from typing import TypedDict


class BusinessTemplate(TypedDict):
    name: str
    icon: str
    units: list[str]
    modules: dict[str, bool]
    default_categories: list[str]


# Полный набор известных модулей. Шаблоны заполняют булевы значения, неизвестные
# модули по умолчанию считаются включёнными (см. логику на фронте).
ALL_MODULES: tuple[str, ...] = (
    "delivery",
    "warranty",
    "serial_numbers",
    "repairs",
    "installment",
    "expiry_date",
    "weight_scale",
    "sizes_colors",
    "bulk_units",
    "fast_checkout",
    "fitting_room",
    "age_groups",
    "pet_types",
    "prescription",
    "batch_tracking",
    "min_order_qty",
)

BUSINESS_TEMPLATES: dict[str, BusinessTemplate] = {
    "electronics": {
        "name": "Бытовая техника и электроника",
        "icon": "🔌",
        "units": ["шт"],
        "modules": {
            "delivery": True, "warranty": True, "serial_numbers": True,
            "repairs": True, "installment": True,
            "expiry_date": False, "weight_scale": False, "sizes_colors": False, "bulk_units": False,
        },
        "default_categories": [
            "Крупная бытовая техника", "Мелкая бытовая техника",
            "Климатическая техника", "Электроника и гаджеты",
            "Крепления и монтаж", "Аксессуары и расходники",
            "Фильтры и картриджи", "Батарейки и аккумуляторы",
        ],
    },
    "grocery": {
        "name": "Продукты и бакалея",
        "icon": "🛒",
        "units": ["шт", "кг", "г", "л", "мл", "уп"],
        "modules": {
            "delivery": False, "warranty": False, "serial_numbers": False,
            "repairs": False, "installment": False,
            "expiry_date": True, "weight_scale": True, "sizes_colors": False,
            "bulk_units": True, "fast_checkout": True,
        },
        "default_categories": [
            "Бакалея и крупы", "Молочные продукты", "Мясо и рыба",
            "Хлеб и выпечка", "Фрукты и овощи", "Напитки",
            "Кондитерские изделия", "Заморозка",
        ],
    },
    "clothing": {
        "name": "Одежда и обувь",
        "icon": "👗",
        "units": ["шт"],
        "modules": {
            "delivery": False, "warranty": False, "serial_numbers": False,
            "repairs": False, "installment": True,
            "expiry_date": False, "weight_scale": False, "sizes_colors": True,
            "fitting_room": True,
        },
        "default_categories": [
            "Верхняя одежда", "Платья и юбки", "Брюки и джинсы",
            "Рубашки и блузки", "Футболки и майки", "Обувь",
            "Аксессуары", "Нижнее бельё",
        ],
    },
    "household_chemicals": {
        "name": "Бытовая химия и гигиена",
        "icon": "🧴",
        "units": ["шт", "л", "мл", "кг", "г", "уп"],
        "modules": {
            "delivery": False, "warranty": False, "serial_numbers": False,
            "expiry_date": True, "weight_scale": False, "sizes_colors": False,
            "bulk_units": True,
        },
        "default_categories": [
            "Стиральные порошки и гели", "Средства для посуды",
            "Чистящие средства", "Средства для уборки",
            "Освежители и дезодоранты", "Личная гигиена",
            "Уход за волосами", "Уход за телом",
        ],
    },
    "pharmacy": {
        "name": "Аптека и медтовары",
        "icon": "💊",
        "units": ["шт", "уп", "мл", "мг", "г"],
        "modules": {
            "delivery": False, "warranty": False, "serial_numbers": True,
            "expiry_date": True, "weight_scale": False,
            "prescription": True, "batch_tracking": True,
        },
        "default_categories": [
            "Лекарственные препараты", "Витамины и БАДы",
            "Перевязочные материалы", "Медицинские приборы",
            "Детское здоровье", "Косметика и гигиена", "Ортопедия",
        ],
    },
    "construction": {
        "name": "Стройматериалы и инструменты",
        "icon": "🧱",
        "units": ["шт", "м²", "м³", "м", "кг", "уп", "рул", "л"],
        "modules": {
            "delivery": True, "warranty": False, "serial_numbers": False,
            "expiry_date": False, "weight_scale": False,
            "bulk_units": True, "min_order_qty": True,
        },
        "default_categories": [
            "Отделочные материалы", "Краски и лаки",
            "Плитка и напольные покрытия", "Сантехника", "Электрика",
            "Инструменты", "Крепёж и метизы", "Двери и окна",
        ],
    },
    "children": {
        "name": "Детские товары",
        "icon": "🧸",
        "units": ["шт", "уп"],
        "modules": {
            "delivery": True, "warranty": True, "serial_numbers": False,
            "expiry_date": False, "weight_scale": False, "sizes_colors": True,
            "age_groups": True,
        },
        "default_categories": [
            "Игрушки и игры", "Одежда детская", "Обувь детская",
            "Коляски и транспорт", "Питание и гигиена",
            "Школьные товары", "Спорт и активный отдых",
        ],
    },
    "pet": {
        "name": "Зоотовары",
        "icon": "🌿",
        "units": ["шт", "кг", "г", "л", "уп"],
        "modules": {
            "delivery": False, "warranty": False, "serial_numbers": False,
            "expiry_date": True, "weight_scale": False, "bulk_units": True,
            "pet_types": True,
        },
        "default_categories": [
            "Корм для кошек", "Корм для собак", "Наполнители и гигиена",
            "Игрушки для животных", "Аксессуары и одежда",
            "Витамины и лечение", "Аквариумистика",
        ],
    },
    "general": {
        "name": "Другое (настроить вручную)",
        "icon": "🏪",
        "units": ["шт"],
        "modules": {
            "delivery": False, "warranty": False, "serial_numbers": False,
            "expiry_date": False, "weight_scale": False, "sizes_colors": False,
            "bulk_units": False,
        },
        "default_categories": ["Основная категория", "Другое"],
    },
}
