"""Nightly summary job."""

from datetime import date

from .models import Item
from .reports import low_stock_skus
from .utils import normalize_sku


def main() -> tuple[int, str]:
    """Build the summary and return (total_units, status)."""
    items = [
        Item(normalize_sku("a 1"), "bolt", 3, date(2026, 1, 1)),
        Item(normalize_sku("b 2"), "nut", 40, date(2026, 1, 2)),
    ]
    total = sum(i.quantity for i in items)
    status = "LOWSTOCK" if low_stock_skus(items) else "HEALTHY"
    return total, status
