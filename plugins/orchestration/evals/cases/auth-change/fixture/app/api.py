from app.reset import reset_password


def post_reset(body):
    return {"ok": reset_password(body["token"], body["password"])}
