"""Shared helpers."""


def normalize_sku(sku: str) -> str:
    """Return the canonical form of a SKU: trimmed, upper-case, dashes for spaces."""
    return sku.strip().upper().replace(" ", "-")


def clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))
