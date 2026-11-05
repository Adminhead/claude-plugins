from app.ledger import apply_ledger


def push(entries):
    return apply_ledger(entries, 0)
