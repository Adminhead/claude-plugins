"""Thread-safe hit counter shared by request handlers."""

import threading


class HitCounter:
    def __init__(self):
        self._lock = threading.Lock()
        self.count = 0

    def increment(self) -> int:
        with self._lock:
            current = self.count
        current += 1
        with self._lock:
            self.count = current
        return current

    def value(self) -> int:
        with self._lock:
            return self.count
