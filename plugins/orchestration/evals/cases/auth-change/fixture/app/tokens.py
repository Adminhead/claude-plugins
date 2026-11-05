import secrets

TOKENS = {}


def issue_reset_token(user):
    t = secrets.token_hex(16)
    TOKENS[t] = user
    return t


def redeem(token):
    return TOKENS.pop(token, None)
