Slice S2 (make `apply_ledger` in app/ledger.py reject a batch atomically when any entry would take the balance negative, and keep the audit-trail ordering invariant across the three writers that call it) was handed to a coder agent on sonnet/high. It failed. Its report, verbatim:

> Status: failed. Cause is known: the three writers (app/ledger.py, app/audit.py, app/sync.py) share one ordering invariant that my change breaks when a batch is rejected halfway, and I could not restructure all three within one pass at this model. The tests I added fail on the interleaving case. escalate: coder on opus with this report.

Carry on with S2.
