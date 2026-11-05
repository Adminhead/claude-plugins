from app.tokens import redeem


def reset_password(token, new_password):
    user = redeem(token)
    return user is not None
