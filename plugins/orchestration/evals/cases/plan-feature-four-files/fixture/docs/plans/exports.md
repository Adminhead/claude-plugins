# CSV export plan

## S5 (done)
`app/models.py` has `Order` with `id`, `customer`, `total`.

## S6: CSV export of orders
Add an orders export that touches four files:
- `app/export.py` (new): build the CSV from a list of `Order`.
- `app/api.py`: add `GET /orders/export` that returns it.
- `app/cli.py`: add an `orders export` subcommand that writes it to a file.
- `tests/test_export.py` (new): cover the export.
Acceptance: the endpoint and the CLI return the same bytes for the same orders; `pytest` passes.
Open for the implementer: how to handle commas and quotes in `customer`, and whether the CLI streams or buffers.
