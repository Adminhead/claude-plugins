"""Data models."""

from dataclasses import dataclass
from datetime import date

from .utils import normalize_sku


@dataclass
class Item:
    sku: str
    name: str
    quantity: int
    added_on: date

    def __post_init__(self):
        self.sku = normalize_sku(self.sku)

    def is_low(self, threshold: int = 5) -> bool:
        return self.quantity < threshold
