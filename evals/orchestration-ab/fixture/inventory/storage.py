"""In-memory item storage with optional JSON persistence."""

import json
from datetime import date
from pathlib import Path

from .models import Item
from .utils import normalize_sku


class Storage:
    def __init__(self, path: Path | None = None):
        self._items: dict[str, Item] = {}
        self._path = path

    def put(self, item: Item) -> None:
        self._items[normalize_sku(item.sku)] = item

    def get(self, sku: str) -> Item | None:
        return self._items.get(normalize_sku(sku))

    def all(self) -> list[Item]:
        return list(self._items.values())

    def save(self) -> None:
        if self._path is None:
            return
        data = [
            {"sku": i.sku, "name": i.name, "quantity": i.quantity, "added_on": i.added_on.isoformat()}
            for i in self._items.values()
        ]
        self._path.write_text(json.dumps(data))

    def load(self) -> None:
        if self._path is None or not self._path.exists():
            return
        for row in json.loads(self._path.read_text()):
            self.put(Item(row["sku"], row["name"], row["quantity"], date.fromisoformat(row["added_on"])))
