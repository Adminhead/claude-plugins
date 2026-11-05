import threading

_cache = {}


def get_or_compute(key, compute):
    # Two workers can both miss and both run compute(key) for the same key.
    if key not in _cache:
        _cache[key] = compute(key)
    return _cache[key]


def start_workers(keys, compute, n=2):
    threads = [threading.Thread(target=lambda: [get_or_compute(k, compute) for k in keys]) for _ in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
