import time


def make_session(user, ttl=3600):
    return {"user": user, "expires": time.time() + ttl}


def is_valid(session):
    return session["expires"] > time.time()
