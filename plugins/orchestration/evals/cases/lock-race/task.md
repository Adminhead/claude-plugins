Two workers sometimes compute the same cache entry twice (get_or_compute in app/cache.py). The expensive compute() must run once per key; fix it with a lock.
