from app.users import get_user


def mailer_view(user_id):
    user = get_user(user_id)
    return {"user": user, "view": "mailer"}
