from src.settings import load

cfg = load()


def call(url):
    return (url, cfg["timeout"])
