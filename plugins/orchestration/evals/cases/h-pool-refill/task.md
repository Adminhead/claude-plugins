Two requests can both refill the connection pool at once (refill in app/pool.py), so we sometimes open double the connections. Make refill safe under concurrent callers.
