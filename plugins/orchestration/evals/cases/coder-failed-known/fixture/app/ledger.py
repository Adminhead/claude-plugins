def apply_ledger(entries, balance):
    for e in entries:
        balance += e
    return balance
