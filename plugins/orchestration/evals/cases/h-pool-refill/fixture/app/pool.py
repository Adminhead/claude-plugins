import threading

class Pool:
    def __init__(self, size):
        self.size = size
        self.conns = []

    def refill(self):
        missing = self.size - len(self.conns)
        for _ in range(missing):
            self.conns.append(object())
