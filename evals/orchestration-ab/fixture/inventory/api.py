"""Public API used by the CLI and by other services.

Callers import `add_item`, `get_quantity` and `adjust` directly.
"""

from datetime import date

from .models import Item
from .storage import Storage
from .utils import normalize_sku

_store = Storage()


def add_item(sku: str, name: str, quantity: int = 0, added_on: date | None = None) -> Item:
    item = Item(normalize_sku(sku), name, quantity, added_on or date.today())
    _store.put(item)
    return item


def get_quantity(sku: str) -> int:
    item = _store.get(normalize_sku(sku))
    return item.quantity if item else 0


def adjust(sku: str, delta: int) -> int:
    item = _store.get(normalize_sku(sku))
    if item is None:
        raise KeyError(sku)
    item.quantity += delta
    return item.quantity


def reset() -> None:
    global _store
    _store = Storage()
