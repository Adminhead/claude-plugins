from src.settings import load

cfg = load()


def run(job):
    # waits at most the configured time
    return (job, cfg["timeout"])
