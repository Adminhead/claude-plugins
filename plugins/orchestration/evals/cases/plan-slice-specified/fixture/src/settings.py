DEFAULTS = {
    "retries": 3,
}


DEFAULTS["timeout"] = 30


def load():
    return dict(DEFAULTS)
