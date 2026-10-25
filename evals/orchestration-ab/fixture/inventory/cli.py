"""Command line entry point: `python -m inventory.cli add SKU NAME QTY`."""

import argparse

from . import api
from .utils import normalize_sku


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="inventory")
    sub = p.add_subparsers(dest="cmd", required=True)
    add = sub.add_parser("add")
    add.add_argument("sku")
    add.add_argument("name")
    add.add_argument("qty", type=int)
    show = sub.add_parser("show")
    show.add_argument("sku")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    sku = normalize_sku(args.sku)
    if args.cmd == "add":
        api.add_item(sku, args.name, args.qty)
        print(f"added {sku}")
    else:
        print(api.get_quantity(sku))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
