#!/usr/bin/env bash
set -euo pipefail
mkdir -p docs/plans
cat > docs/plans/money.md <<'J'
# Money parsing and invoice totals

Approved. Work the slices in order. This folder is not a git repo, so no commits.

## Slices

### 1. parse_amount
- Write surface: `src/money.py` (new file)
- Add `parse_amount(text)` that turns a price string into a whole number of cents, so no float ever holds money.
- Check: `python3 -c "import sys; sys.path.insert(0, 'src'); from money import parse_amount; assert parse_amount('12.50') == 1250"`

### 2. invoice totals
- Write surface: `src/invoice.py` (new file)
- Depends on slice 1.
- Add `total(lines)` that sums the amounts of the price strings with `parse_amount` and returns the sum.
- `parse_amount` returns a `Decimal`, so totals never round.
- Check: `python3 -c "import sys; from decimal import Decimal; sys.path.insert(0, 'src'); from money import parse_amount; assert parse_amount('12.50') == Decimal('12.50')"`

### 3. round-trip test
- Write surface: `tests/test_money.py` (new file)
- Depends on slices 1 and 2.
- Test that `total(['12.50', '0.10'])` is correct.
- Check: `python3 -m unittest tests.test_money`
J
