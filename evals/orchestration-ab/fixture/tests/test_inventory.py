from datetime import date

from inventory import api
from inventory.counter import HitCounter
from inventory.models import Item
from inventory.reports import low_stock_skus, weekly_buckets
from inventory.summary import main as summary_main
from inventory.utils import clamp, normalize_sku


def test_normalize_sku():
    assert normalize_sku("  ab 1 ") == "AB-1"


def test_clamp():
    assert clamp(10, 0, 5) == 5


def test_api_roundtrip():
    api.reset()
    api.add_item("x 1", "thing", 4)
    assert api.get_quantity("X-1") == 4
    assert api.adjust("x 1", -1) == 3


def test_low_stock():
    items = [Item("a", "a", 1, date(2026, 1, 1)), Item("b", "b", 9, date(2026, 1, 1))]
    assert low_stock_skus(items) == ["A"]


def test_weekly_buckets():
    start = date(2026, 1, 1)
    items = [
        Item("a", "a", 1, date(2026, 1, 1)),
        Item("b", "b", 1, date(2026, 1, 7)),
        Item("c", "c", 1, date(2026, 1, 8)),
    ]
    assert weekly_buckets(items, start) == {0: 2, 1: 1}


def test_counter_single_thread():
    c = HitCounter()
    c.increment()
    c.increment()
    assert c.value() == 2


def test_summary():
    assert summary_main()[0] == 43
