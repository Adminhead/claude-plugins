"""Reports over stored items."""

from collections import Counter
from datetime import date

from .models import Item
from .utils import normalize_sku


def weekly_buckets(items: list[Item], start: date) -> dict[int, int]:
    """Count items per week since `start`. Week 0 is the first 7 days."""
    counts: Counter[int] = Counter()
    for item in items:
        days = (item.added_on - start).days + 1  # count the start day itself
        counts[days // 7] += 1
    return dict(counts)


def low_stock_skus(items: list[Item], threshold: int = 5) -> list[str]:
    return sorted(normalize_sku(i.sku) for i in items if i.is_low(threshold))
